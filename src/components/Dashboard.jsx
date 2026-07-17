import React, { useState, useEffect, useRef } from 'react';
import AllocationChart from './AllocationChart';
import Performance from './Performance';
import { 
  Search, Plus, RefreshCw, Trash2, ArrowUpRight, ArrowDownRight, 
  TrendingUp, TrendingDown, Wallet, Calendar, Landmark, Info, X, ChevronDown, ChevronRight,
  Clock, MessageSquare, Download, Pencil
} from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const ACCOUNT_COLORS = [
  '#6366f1', '#a855f7', '#14b8a6', '#f59e0b',
  '#10b981', '#3b82f6', '#ec4899', '#f43f5e',
  '#8b5cf6', '#06b6d4'
];

// Convert YYYY-MM-DD (stored format) → DD/MM/YYYY (display format)
const fmtDate = (dateStr) => {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr; // fallback
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// Convert YYYY-MM-DD → DD/MM/YYYY display string
const toDisplayDate = (ymd) => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d || ''}/${m || ''}/${y || ''}`;
};

function Dashboard({ user, accounts = [], selectedAccountId, defaultAccountId }) {
  // Tabs state
  const [activeTab, setActiveTab] = useState('holdings'); // 'holdings' or 'transactions'

  // Portfolio state
  const [holdings, setHoldings] = useState([]);
  const [holdingsSortCol, setHoldingsSortCol] = useState('currentValue'); // 'currentValue' | 'investedValue'
  const [holdingsSortDir, setHoldingsSortDir] = useState('desc'); // 'asc' | 'desc'
  const [summary, setSummary] = useState({
    totalInvested: 0,
    totalValue: 0,
    totalProfitLoss: 0,
    totalProfitLossPercentage: 0,
    totalDailyGain: 0,
    totalDailyGainPercentage: 0
  });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [editingTxId, setEditingTxId] = useState(null);
  const [includeNotesInExport, setIncludeNotesInExport] = useState(false);

  // Stock Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Modal / Transaction Dialog Form state
  const [formType, setFormType] = useState('BUY'); // 'BUY' or 'SELL'
  const [formSymbol, setFormSymbol] = useState('');
  const [formName, setFormName] = useState('');
  const [formUrlPath, setFormUrlPath] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDateDisplay, setFormDateDisplay] = useState(() => {
    const t = new Date(); 
    return `${String(t.getDate()).padStart(2,'0')}/${String(t.getMonth()+1).padStart(2,'0')}/${t.getFullYear()}`;
  });
  const [formNotes, setFormNotes] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  
  // Ratios detail overlay state
  const [selectedHolding, setSelectedHolding] = useState(null);

  // Expanded holding rows (for lot breakdown dropdown)
  const [expandedHoldings, setExpandedHoldings] = useState(new Set());

  const dialogRef = useRef(null);
  const detailsDialogRef = useRef(null);
  const searchContainerRef = useRef(null);
  const isFirstAccessRef = useRef(true);

  // Close search suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchPortfolio = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const userId = user.id;
      const q = query(collection(db, 'transactions'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      const allTxs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      let userTxs = allTxs;
      // Filter by selected account (null = All Accounts)
      if (selectedAccountId) {
        userTxs = userTxs.filter(t => t.accountId === selectedAccountId);
      }

      // Sort chronologically for holdings math
      userTxs.sort((a, b) => new Date(a.date) - new Date(b.date));

      const holdingsMap = {};

      for (const tx of userTxs) {
        const { symbol, name, urlPath, type, quantity, price, date, notes, id, accountId } = tx;
        // Group strictly by symbol (combined across accounts when selectedAccountId is null)
        const holdingKey = symbol;

        if (!holdingsMap[holdingKey]) {
          holdingsMap[holdingKey] = {
            symbol,
            name,
            urlPath,
            quantity: 0,
            totalCost: 0,
            avgBuyPrice: 0,
            lots: [],  // individual BUY lots
            accountIds: [],
            accountId: null
          };
        }

        const holding = holdingsMap[holdingKey];
        const qty = parseFloat(quantity);
        const prc = parseFloat(price);

        if (type === 'BUY') {
          holding.quantity += qty;
          holding.totalCost += qty * prc;
          holding.avgBuyPrice = holding.quantity > 0 ? (holding.totalCost / holding.quantity) : 0;
          // Track each lot including its accountId
          holding.lots.push({ id, quantity: qty, price: prc, date, notes: notes || '', accountId });
          if (!holding.accountId) {
            holding.accountId = accountId;
          }
          if (accountId && !holding.accountIds.includes(accountId)) {
            holding.accountIds.push(accountId);
          }
        } else if (type === 'SELL') {
          holding.quantity -= qty;
          if (holding.quantity < 0) holding.quantity = 0;
          
          holding.totalCost = holding.quantity * holding.avgBuyPrice;
          if (holding.quantity === 0) {
            holding.avgBuyPrice = 0;
            holding.totalCost = 0;
            holding.lots = [];
            holding.accountId = null;
            holding.accountIds = [];
          }
        }
      }

      const activeHoldings = Object.values(holdingsMap).filter(h => h.quantity > 0);

      // Cache setup
      const todayStr = new Date().toLocaleDateString('en-CA');
      let cache = {};
      try {
        const cachedData = localStorage.getItem('indiaportfolio_price_cache');
        if (cachedData) {
          cache = JSON.parse(cachedData);
        }
      } catch (err) {
        console.error('Failed to parse price cache:', err);
      }

      const lastAccessDay = localStorage.getItem('indiaportfolio_last_access_day');
      const isNewDay = lastAccessDay !== todayStr;
      const needFullRefresh = (isNewDay && isFirstAccessRef.current) || isManualRefresh;

      if (isNewDay && isFirstAccessRef.current) {
        localStorage.setItem('indiaportfolio_last_access_day', todayStr);
      }
      isFirstAccessRef.current = false;

      const holdingsList = [];
      let totalInvested = 0;
      let totalValue = 0;
      let totalDailyGain = 0;

      for (const holding of activeHoldings) {
        let priceData = null;
        let fetchedSuccessfully = false;

        const cachedItem = cache[holding.urlPath];
        const shouldFetch = needFullRefresh || !cachedItem || cachedItem.lastFetchedDate !== todayStr;

        if (shouldFetch) {
          try {
            const response = await fetch(`/api/stocks/price?urlPath=${encodeURIComponent(holding.urlPath)}`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            if (response.ok) {
              const latestData = await response.json();
              priceData = {
                ...latestData,
                lastFetchedDate: todayStr,
                scrapedAt: new Date().toISOString()
              };
              cache[holding.urlPath] = priceData;
              fetchedSuccessfully = true;
            } else {
              throw new Error('API quote fetch returned non-ok response status');
            }
          } catch (err) {
            console.error(`Failed to fetch latest price for ${holding.symbol} from API:`, err.message);
          }
        }

        // If fetch failed or we didn't fetch, try to use cache
        if (!priceData && cachedItem) {
          priceData = cachedItem;
        }

        if (priceData) {
          const currentPrice = priceData.currentPrice || holding.avgBuyPrice;
          const currentValue = holding.quantity * currentPrice;
          const investedValue = holding.quantity * holding.avgBuyPrice;
          const profitLoss = currentValue - investedValue;
          const profitLossPercentage = investedValue > 0 ? (profitLoss / investedValue) * 100 : 0;

          let daysGainAmount = 0;
          if (priceData.changePercent !== null && priceData.changePercent !== undefined) {
            const prevPrice = currentPrice / (1 + priceData.changePercent / 100);
            daysGainAmount = holding.quantity * (currentPrice - prevPrice);
            totalDailyGain += daysGainAmount;
          }

          const now = new Date();
          const oldestLotDate = holding.lots.length > 0
            ? new Date(Math.min(...holding.lots.map(l => new Date(l.date))))
            : now;
          const monthsHeld = (now - oldestLotDate) / (1000 * 60 * 60 * 24 * 30.44);
          const termType = monthsHeld >= 12 ? 'Long Term' : 'Short Term';

          const enrichedLots = holding.lots.map(lot => {
            const lotInvested = lot.quantity * lot.price;
            const lotValue = lot.quantity * currentPrice;
            const lotPL = lotValue - lotInvested;
            const lotPLPct = lotInvested > 0 ? (lotPL / lotInvested) * 100 : 0;
            const lotMonths = (now - new Date(lot.date)) / (1000 * 60 * 60 * 24 * 30.44);
            return {
              ...lot,
              currentPrice,
              lotValue,
              lotInvested,
              lotPL,
              lotPLPct,
              termType: lotMonths >= 12 ? 'Long Term' : 'Short Term'
            };
          });

          holdingsList.push({
            ...holding,
            lots: enrichedLots,
            currentPrice,
            changePercent: priceData.changePercent,
            daysGainAmount,
            currentValue,
            investedValue,
            profitLoss,
            profitLossPercentage,
            termType,
            accountId: holding.accountId,
            error: shouldFetch && !fetchedSuccessfully ? 'Failed to fetch latest price (used cache)' : undefined,
            ratios: {
              marketCap: priceData.marketCap,
              peRatio: priceData.peRatio,
              bookValue: priceData.bookValue,
              dividendYield: priceData.dividendYield,
              roce: priceData.roce,
              roe: priceData.roe,
              faceValue: priceData.faceValue
            }
          });

          totalInvested += investedValue;
          totalValue += currentValue;
        } else {
          // Both fetch failed and no cache exists at all
          const currentPrice = holding.avgBuyPrice;
          const currentValue = holding.quantity * currentPrice;
          const investedValue = holding.quantity * holding.avgBuyPrice;

          const now2 = new Date();
          const oldestLotDate2 = holding.lots.length > 0
            ? new Date(Math.min(...holding.lots.map(l => new Date(l.date))))
            : now2;
          const monthsHeld2 = (now2 - oldestLotDate2) / (1000 * 60 * 60 * 24 * 30.44);
          holdingsList.push({
            ...holding,
            currentPrice,
            changePercent: null,
            daysGainAmount: 0,
            currentValue,
            investedValue,
            profitLoss: 0,
            profitLossPercentage: 0,
            termType: monthsHeld2 >= 12 ? 'Long Term' : 'Short Term',
            error: 'Failed to fetch latest price'
          });

          totalInvested += investedValue;
          totalValue += currentValue;
        }
      }

      // Save updated cache to localStorage
      try {
        localStorage.setItem('indiaportfolio_price_cache', JSON.stringify(cache));
      } catch (err) {
        console.error('Failed to save price cache to localStorage:', err);
      }

      const totalProfitLoss = totalValue - totalInvested;
      const totalProfitLossPercentage = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

      const yesterdayValue = totalValue - totalDailyGain;
      const totalDailyGainPercentage = yesterdayValue > 0 ? (totalDailyGain / yesterdayValue) * 100 : 0;

      setHoldings(holdingsList);
      setSummary({
        totalInvested,
        totalValue,
        totalProfitLoss,
        totalProfitLossPercentage,
        totalDailyGain,
        totalDailyGainPercentage,
        updatedAt: new Date().toISOString()
      });
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to calculate portfolio holdings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const userId = user.id;
      const q = query(collection(db, 'transactions'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      const allTxs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      let userTxs = allTxs;
      // Filter by selected account (null = All Accounts)
      if (selectedAccountId) {
        userTxs = userTxs.filter(t => t.accountId === selectedAccountId);
      }
      // Sort descending (latest first)
      userTxs.sort((a, b) => new Date(b.date) - new Date(a.date));
      setTransactions(userTxs);
    } catch (err) {
      console.error('Failed to load transactions from localStorage:', err);
    }
  };

  // Fetch data when selectedAccountId changes (declared after fetchPortfolio/fetchTransactions)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPortfolio();
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId]);

  const handleSearchChange = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);

    if (q.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
        setShowSearchDropdown(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Toggle expanded holding row
  const toggleHoldingExpand = (holdingKey) => {
    setExpandedHoldings(prev => {
      const next = new Set(prev);
      if (next.has(holdingKey)) next.delete(holdingKey);
      else next.add(holdingKey);
      return next;
    });
  };

  // Helper to open transaction dialog and fetch stock price
  const openTransactionDialog = async (symbol, name, urlPath, prefillType = 'BUY') => {
    setEditingTxId(null);
    setFormSymbol(symbol);
    setFormName(name);
    setFormUrlPath(urlPath);
    setFormType(prefillType);
    setFormQuantity('');
    setFormPrice('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormDateDisplay(toDisplayDate(new Date().toISOString().split('T')[0]));
    setFormNotes('');
    setFormError('');
    // Pre-select account: use selectedAccountId if specific account active, else defaultAccountId
    setFormAccountId(selectedAccountId || defaultAccountId || (accounts.length > 0 ? accounts[0].id : ''));
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchDropdown(false);

    // Open modal first with loading price state
    if (dialogRef.current) {
      dialogRef.current.showModal();
    }

    setFormLoading(true);
    try {
      // Fetch latest price from scraper to pre-populate form
      const response = await fetch(`/api/stocks/price?urlPath=${encodeURIComponent(urlPath)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.currentPrice) {
          setFormPrice(data.currentPrice.toString());
        }
      }
    } catch (err) {
      console.error('Error prefetching stock price:', err);
    } finally {
      setFormLoading(false);
    }
  };

  const handleAddTransactionSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formSymbol || !formName || !formQuantity || !formPrice) {
      setFormError('Please fill in all transaction details.');
      return;
    }

    if (!formAccountId) {
      setFormError('Please select a portfolio account.');
      return;
    }

    // Verify date is valid (must be YYYY-MM-DD with 10 chars)
    if (!formDate || formDate.length !== 10 || formDateDisplay.length !== 10) {
      setFormError('Please enter a valid date in DD/MM/YYYY format.');
      return;
    }

    const qty = parseFloat(formQuantity);
    const prc = parseFloat(formPrice);

    if (qty <= 0 || prc <= 0) {
      setFormError('Quantity and price must be greater than zero.');
      return;
    }

    try {
      const userId = user.id;
      const q = query(collection(db, 'transactions'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      const allTxs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Construct transaction object
      let newTx;
      if (editingTxId) {
        const originalTx = allTxs.find(t => t.id === editingTxId && t.userId === userId);
        if (!originalTx) {
          setFormError('Original transaction not found.');
          return;
        }
        newTx = {
          ...originalTx,
          accountId: formAccountId,
          symbol: formSymbol.toUpperCase(),
          name: formName,
          urlPath: formUrlPath,
          type: formType,
          quantity: qty,
          price: prc,
          date: formDate,
          notes: formNotes.trim(),
          updatedAt: new Date().toISOString()
        };
      } else {
        newTx = {
          userId,
          accountId: formAccountId,
          symbol: formSymbol.toUpperCase(),
          name: formName,
          urlPath: formUrlPath,
          type: formType,
          quantity: qty,
          price: prc,
          date: formDate,
          notes: formNotes.trim(),
          createdAt: new Date().toISOString()
        };
      }

      // Simulation check for negative holdings
      let simulatedTxs;
      if (editingTxId) {
        simulatedTxs = allTxs.map(t => (t.id === editingTxId && t.userId === userId) ? newTx : t);
      } else {
        simulatedTxs = [...allTxs, newTx];
      }

      const userSimulatedTxs = simulatedTxs;
      // Sort chronologically for holdings math
      userSimulatedTxs.sort((a, b) => new Date(a.date) - new Date(b.date));

      const runningQuantities = {};
      for (const tx of userSimulatedTxs) {
        const key = `${tx.symbol}__${tx.accountId || 'default'}`;
        if (!runningQuantities[key]) {
          runningQuantities[key] = 0;
        }
        if (tx.type === 'BUY') {
          runningQuantities[key] += tx.quantity;
        } else if (tx.type === 'SELL') {
          runningQuantities[key] -= tx.quantity;
        }
        if (runningQuantities[key] < 0) {
          setFormError(`Chronological validation failed: Transaction on ${toDisplayDate(tx.date)} would result in negative holdings (${runningQuantities[key].toFixed(4)} shares) for ${tx.symbol} in the selected account.`);
          return;
        }
      }

      // Save transaction to Firestore
      if (editingTxId) {
        const txRef = doc(db, 'transactions', editingTxId);
        const updateData = { ...newTx };
        delete updateData.id;
        await updateDoc(txRef, updateData);
      } else {
        await addDoc(collection(db, 'transactions'), newTx);
      }

      // Close Dialog
      if (dialogRef.current) {
        dialogRef.current.close();
      }

      // Reset editing state
      setEditingTxId(null);

      // Refresh data
      setLoading(true);
      await fetchPortfolio();
      fetchTransactions();
    } catch (err) {
      console.error(err);
      setFormError('Failed to save transaction locally.');
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (!window.confirm('Are you sure you want to delete this transaction? This will recalculate your holdings.')) {
      return;
    }

    try {
      // Delete from Firestore
      await deleteDoc(doc(db, 'transactions', id));

      setLoading(true);
      await fetchPortfolio();
      fetchTransactions();
    } catch (err) {
      console.error(err);
      alert('Failed to delete transaction.');
    }
  };

  const handleEditTransaction = (tx) => {
    setEditingTxId(tx.id);
    setFormSymbol(tx.symbol);
    setFormName(tx.name);
    setFormUrlPath(tx.urlPath || '');
    setFormType(tx.type);
    setFormQuantity(tx.quantity.toString());
    setFormPrice(tx.price.toString());
    setFormDate(tx.date);
    setFormDateDisplay(toDisplayDate(tx.date));
    setFormNotes(tx.notes || '');
    setFormAccountId(tx.accountId || '');
    setFormError('');

    if (dialogRef.current) {
      dialogRef.current.showModal();
    }
  };

  const showHoldingDetails = (holding) => {
    setSelectedHolding(holding);
    if (detailsDialogRef.current) {
      detailsDialogRef.current.showModal();
    }
  };

  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to export the PDF report.');
      return;
    }
    
    const sortedHoldings = [...holdings].sort((a, b) => b.currentValue - a.currentValue);
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;
    
    const isProfit = summary.totalProfitLoss >= 0;
    const profitColor = isProfit ? '#10b981' : '#f43f5e';
    const isDailyProfit = (summary.totalDailyGain || 0) >= 0;
    const dailyGainColor = isDailyProfit ? '#10b981' : '#f43f5e';
    
    let holdingsHtml = '';
    sortedHoldings.forEach((item, index) => {
      const itemGain = item.profitLoss >= 0;
      const gainColor = itemGain ? '#10b981' : '#f43f5e';
      const uniqueNotes = [...new Set(item.lots.map(l => l.notes).filter(Boolean))];
      const notesText = uniqueNotes.length > 0 ? uniqueNotes.join('; ') : '—';
      const changeText = item.changePercent !== null && item.changePercent !== undefined 
        ? `${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%` 
        : '—';
      const changeColor = item.changePercent >= 0 ? '#10b981' : (item.changePercent < 0 ? '#f43f5e' : '#334155');

      const daysGainVal = item.daysGainAmount || 0;
      const daysGainColor = item.changePercent >= 0 ? '#10b981' : (item.changePercent < 0 ? '#f43f5e' : '#64748b');
      const daysGainText = item.changePercent !== null && item.changePercent !== undefined
        ? `<div style="color: ${daysGainColor}; font-weight: 600;">
             <div>${item.changePercent >= 0 ? '+' : ''}₹${daysGainVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
             <div style="font-size: 10px;">${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%</div>
           </div>`
        : '<span style="color: #64748b;">—</span>';

      holdingsHtml += `
        <tr>
          <td><strong>${index + 1}</strong></td>
          <td>
            <div style="font-size: 13px; font-weight: 600; color: #0f172a;">${item.symbol}</div>
            <div style="font-size: 10px; color: #64748b;">${item.name}</div>
          </td>
          <td>${item.quantity}</td>
          <td>₹${item.avgBuyPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>
            <div>₹${item.currentPrice ? item.currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</div>
            <div style="font-size: 10px; color: ${changeColor}; font-weight: 600;">${changeText} (Day)</div>
          </td>
          <td>₹${item.investedValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
          <td>₹${item.currentValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
          <td>${daysGainText}</td>
          <td style="color: ${gainColor}; font-weight: 600;">
            <div>${itemGain ? '+' : ''}₹${item.profitLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            <div style="font-size: 10px;">${itemGain ? '+' : ''}${item.profitLossPercentage.toFixed(2)}%</div>
          </td>
          <td>
            <span style="
              display: inline-block;
              font-size: 9px;
              font-weight: 600;
              padding: 2px 6px;
              border-radius: 4px;
              ${item.termType === 'Long Term' ? 'background-color: #ccfbf1; color: #0d9488;' : 'background-color: #fef3c7; color: #d97706;'}
            ">${item.termType}</span>
          </td>
          ${includeNotesInExport ? `<td style="max-width: 180px; color: #475569; font-style: italic; word-wrap: break-word;">${notesText}</td>` : ''}
        </tr>
      `;
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Portfolio Report - ${dateStr}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              color: #1e293b;
              margin: 0;
              padding: 24px;
              background-color: #ffffff;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 16px;
              margin-bottom: 24px;
            }
            .title h1 {
              font-size: 24px;
              margin: 0;
              font-weight: 700;
              color: #0f172a;
              letter-spacing: -0.02em;
            }
            .title p {
              margin: 4px 0 0 0;
              font-size: 13px;
              color: #64748b;
            }
            .date {
              text-align: right;
              font-size: 13px;
              color: #64748b;
            }
            .summary-cards {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 16px;
              margin-bottom: 24px;
            }
            .card {
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 16px;
              background-color: #f8fafc;
            }
            .card-label {
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
              color: #64748b;
              letter-spacing: 0.05em;
              margin-bottom: 6px;
            }
            .card-value {
              font-size: 20px;
              font-weight: 700;
              color: #0f172a;
            }
            .table-title {
              font-size: 16px;
              font-weight: 600;
              color: #0f172a;
              margin: 24px 0 12px 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 24px;
              font-size: 12px;
            }
            th, td {
              border-bottom: 1px solid #e2e8f0;
              padding: 10px 8px;
              text-align: left;
            }
            th {
              background-color: #f1f5f9;
              color: #475569;
              font-weight: 600;
            }
            @media print {
              body {
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">
              <h1>IndiaPortfolio Summary Report</h1>
              <p>Personal Equity Tracker</p>
            </div>
            <div class="date">
              <strong>Report Date:</strong> ${dateStr}
            </div>
          </div>
          
          <div class="summary-cards">
            <div class="card">
              <div class="card-label">Current Portfolio Value</div>
              <div class="card-value">₹${summary.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            </div>
            <div class="card">
              <div class="card-label">Total Capital Invested</div>
              <div class="card-value">₹${summary.totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            </div>
            <div class="card" style="border-top: 3px solid ${dailyGainColor};">
              <div class="card-label">Daily Gain</div>
              <div class="card-value" style="color: ${dailyGainColor};">
                ${isDailyProfit ? '+' : ''}₹${(summary.totalDailyGain || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                <span style="font-size: 13px; font-weight: 500;">(${isDailyProfit ? '+' : ''}${(summary.totalDailyGainPercentage || 0).toFixed(2)}%)</span>
              </div>
            </div>
            <div class="card" style="border-top: 3px solid ${profitColor};">
              <div class="card-label">Total Returns</div>
              <div class="card-value" style="color: ${profitColor};">
                ${isProfit ? '+' : ''}₹${summary.totalProfitLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                <span style="font-size: 13px; font-weight: 500;">(${isProfit ? '+' : ''}${summary.totalProfitLossPercentage.toFixed(2)}%)</span>
              </div>
            </div>
          </div>
          
          <h2 class="table-title">Holdings Statement (Sorted by Market Value Descending)</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 20px;">#</th>
                <th>Equity / Stock</th>
                <th>Qty</th>
                <th>Avg. Cost</th>
                <th>Current Price</th>
                <th>Invested</th>
                <th>Mkt Value</th>
                <th>Day's Gain</th>
                <th>Returns</th>
                <th>Term</th>
                ${includeNotesInExport ? '<th>Notes</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${holdingsHtml}
            </tbody>
          </table>
          
          <div style="font-size: 10px; color: #94a3b8; text-align: center; margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
            Generated via IndiaPortfolio. Data source Screener.in.
          </div>
          
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid rgba(255,255,255,0.05)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
      </div>
    );
  }

  const isProfit = summary.totalProfitLoss >= 0;

  // Calculate day's max gainer and max loser from holdings
  const holdingsWithChange = holdings.filter(h => h.changePercent !== null && h.changePercent !== undefined);
  let maxGainer = null;
  let maxLoser = null;
  if (holdingsWithChange.length > 0) {
    const sortedByChange = [...holdingsWithChange].sort((a, b) => b.changePercent - a.changePercent);
    maxGainer = sortedByChange[0];
    maxLoser = sortedByChange[sortedByChange.length - 1];
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Portfolio Title & Actions Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '0.5rem',
        borderBottom: '1px solid var(--card-border)',
        paddingBottom: '1rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontFamily: 'var(--font-display)', fontWeight: 800, color: '#ffffff', margin: 0 }}>
            Holdings Dashboard
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Portfolio as of <strong style={{ color: '#6366f1' }}>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            fontSize: '0.8125rem', 
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            userSelect: 'none'
          }}>
            <input 
              type="checkbox" 
              checked={includeNotesInExport} 
              onChange={(e) => setIncludeNotesInExport(e.target.checked)} 
              style={{
                cursor: 'pointer',
                accentColor: '#a855f7',
                width: '14px',
                height: '14px'
              }}
            />
            <span>Include Notes</span>
          </label>
          <button
            onClick={handleExportPDF}
            className="btn btn-primary"
            style={{
              padding: '0.625rem 1.25rem',
              fontSize: '0.875rem',
              background: 'linear-gradient(135deg, #a855f7, #6366f1)',
              borderColor: 'transparent',
              boxShadow: '0 4px 12px rgba(168, 85, 247, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Download size={16} />
            <span>Export Portfolio PDF</span>
          </button>
        </div>
      </div>

      {/* API Error Alert */}
      {error && (
        <div className="glow-danger" style={{
          backgroundColor: 'rgba(244, 63, 94, 0.1)',
          border: '1px solid rgba(244, 63, 94, 0.2)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          color: '#f43f5e',
          fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <section className="grid-cols-4">
        {/* Total Value */}
        <div className={`glass-panel ${isProfit ? 'glow-success' : 'glow-danger'}`} style={{
          padding: '1.5rem',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Current Portfolio Value</span>
            <Wallet size={20} color="#6366f1" />
          </div>
          <h2 style={{ fontSize: '2rem', fontFamily: 'var(--font-display)', fontWeight: '800', marginBottom: '0.5rem' }}>
            ₹{summary.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </h2>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Updated: {new Date(summary.updatedAt || new Date()).toLocaleTimeString()}
          </div>
          {/* Subtle colored glow stripe on bottom */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '4px',
            backgroundColor: isProfit ? 'var(--success)' : 'var(--danger)'
          }}></div>
        </div>

        {/* Total Invested */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Total Capital Invested</span>
            <Landmark size={20} color="#a855f7" />
          </div>
          <h2 style={{ fontSize: '2rem', fontFamily: 'var(--font-display)', fontWeight: '800', marginBottom: '0.5rem' }}>
            ₹{summary.totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </h2>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Total cash allocated in equities
          </div>
        </div>

        {/* Daily Gain */}
        {(() => {
          const isDailyProfit = summary.totalDailyGain >= 0;
          return (
            <div className={`glass-panel ${isDailyProfit ? 'glow-success' : 'glow-danger'}`} style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Daily Gain</span>
                <TrendingUp size={20} color={isDailyProfit ? 'var(--success)' : 'var(--danger)'} />
              </div>
              <h2 style={{ 
                fontSize: '2rem', 
                fontFamily: 'var(--font-display)', 
                fontWeight: '800', 
                marginBottom: '0.5rem',
                color: isDailyProfit ? 'var(--success)' : 'var(--danger)'
              }}>
                {isDailyProfit ? '+' : ''}₹{summary.totalDailyGain.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span className={`badge ${isDailyProfit ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.8125rem' }}>
                  {isDailyProfit ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {summary.totalDailyGainPercentage.toFixed(2)}%
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Today's return</span>
              </div>
            </div>
          );
        })()}

        {/* Absolute Returns */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Total Profit / Loss</span>
            <TrendingUp size={20} color={isProfit ? 'var(--success)' : 'var(--danger)'} />
          </div>
          <h2 style={{ 
            fontSize: '2rem', 
            fontFamily: 'var(--font-display)', 
            fontWeight: '800', 
            marginBottom: '0.5rem',
            color: isProfit ? 'var(--success)' : 'var(--danger)'
          }}>
            {isProfit ? '+' : ''}₹{summary.totalProfitLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span className={`badge ${isProfit ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.8125rem' }}>
              {isProfit ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {summary.totalProfitLossPercentage.toFixed(2)}%
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Overall return</span>
          </div>
        </div>
      </section>

      {/* Daily Movers (Max Gainer & Max Loser) */}
      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem'
      }}>
        {/* Max Gainer Card */}
        <div className="glass-panel" style={{
          padding: '1.25rem 1.5rem',
          borderLeft: '4px solid var(--success)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <TrendingUp size={14} color="var(--success)" />
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Day's Max Gainer
              </span>
            </div>
            {maxGainer ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '1.25rem', color: '#ffffff', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                    {maxGainer.symbol}
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }} title={maxGainer.name}>
                    {maxGainer.name}
                  </span>
                </div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  Price: ₹{maxGainer.currentPrice ? maxGainer.currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                </span>
              </>
            ) : (
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.25rem' }}>
                No gainer data available
              </span>
            )}
          </div>
          {maxGainer && (
            <div className="badge badge-success" style={{ padding: '0.375rem 0.625rem', fontSize: '0.8125rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
              <ArrowUpRight size={12} />
              {maxGainer.changePercent >= 0 ? '+' : ''}{maxGainer.changePercent.toFixed(2)}%
            </div>
          )}
        </div>

        {/* Max Loser Card */}
        <div className="glass-panel" style={{
          padding: '1.25rem 1.5rem',
          borderLeft: '4px solid var(--danger)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <TrendingDown size={14} color="var(--danger)" />
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Day's Max Loser
              </span>
            </div>
            {maxLoser ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '1.25rem', color: '#ffffff', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                    {maxLoser.symbol}
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }} title={maxLoser.name}>
                    {maxLoser.name}
                  </span>
                </div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  Price: ₹{maxLoser.currentPrice ? maxLoser.currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                </span>
              </>
            ) : (
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.25rem' }}>
                No loser data available
              </span>
            )}
          </div>
          {maxLoser && (
            <div className="badge badge-danger" style={{ padding: '0.375rem 0.625rem', fontSize: '0.8125rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
              <ArrowDownRight size={12} />
              {maxLoser.changePercent >= 0 ? '+' : ''}{maxLoser.changePercent.toFixed(2)}%
            </div>
          )}
        </div>
      </section>

      {/* Allocation and Stock Search Row */}
      <section style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
        gap: '1.5rem'
      }} className="grid-cols-3"> {/* Responsive grid overlay */}
        
        {/* Allocation Chart Card */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '1.25rem', fontFamily: 'var(--font-display)' }}>Asset Allocation</h3>
          <AllocationChart holdings={holdings} />
        </div>

        {/* Add Equity / Autocomplete Search */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.25rem', fontFamily: 'var(--font-display)' }}>Add Investment</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Search for any Indian stock symbol using Screener.in autocomplete</p>
          </div>

          <div style={{ position: 'relative' }} ref={searchContainerRef}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                <Search size={18} />
              </span>
              <input
                type="text"
                placeholder="Search symbol (e.g., RELIANCE, TCS)..."
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => { if (searchResults.length > 0) setShowSearchDropdown(true); }}
              />
              {searchLoading && (
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255,255,255,0.05)',
                    borderTopColor: '#6366f1',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                </span>
              )}
            </div>

            {/* Autocomplete Suggestions Box */}
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="suggestions-box">
                {searchResults.map((item) => (
                  <div
                    key={item.id}
                    className="suggestion-item"
                    onClick={() => {
                      // Extract symbol from url (e.g. "/company/RELIANCE/consolidated/" -> "RELIANCE")
                      let sym = item.url.replace(/\/company\/([^/]+)\/.*/, '$1');
                      if (sym === item.url) { // fallback
                        sym = item.url.replace(/\/company\/([^/]+)\//, '$1');
                      }
                      openTransactionDialog(sym, item.name, item.url, 'BUY');
                    }}
                  >
                    <div>
                      <strong style={{ color: '#ffffff', fontSize: '0.875rem' }}>
                        {item.url.replace(/\/company\/([^/]+)\/.*/, '$1').replace(/\/company\/([^/]+)\//, '$1')}
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>{item.name}</span>
                    </div>
                    <span style={{
                      backgroundColor: 'rgba(99, 102, 241, 0.15)',
                      color: '#6366f1',
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      padding: '0.15rem 0.4rem',
                      borderRadius: '4px'
                    }}>Screener</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Data provided by <a href="https://www.screener.in" target="_blank" rel="noreferrer" style={{ color: '#6366f1', textDecoration: 'none' }}>Screener.in</a>
            </span>
            <button 
              onClick={() => fetchPortfolio(true)} 
              className="btn btn-secondary" 
              style={{ padding: '0.5rem 0.875rem', fontSize: '0.8125rem', gap: '0.375rem' }}
              disabled={refreshing}
            >
              <RefreshCw size={14} className={refreshing ? 'spin-animation' : ''} />
              <span>{refreshing ? 'Fetching...' : 'Fetch Prices'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Tabs and Data Tables Card */}
      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        
        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--card-border)',
          paddingBottom: '1rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('holdings')}
              className="btn"
              style={{
                background: activeTab === 'holdings' ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                color: activeTab === 'holdings' ? '#6366f1' : 'var(--text-secondary)',
                border: activeTab === 'holdings' ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid transparent',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem'
              }}
            >
              Current Holdings
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className="btn"
              style={{
                background: activeTab === 'transactions' ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                color: activeTab === 'transactions' ? '#6366f1' : 'var(--text-secondary)',
                border: activeTab === 'transactions' ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid transparent',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem'
              }}
            >
              Transaction Log ({transactions.length})
            </button>
            <button
              onClick={() => setActiveTab('performance')}
              className="btn"
              style={{
                background: activeTab === 'performance' ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                color: activeTab === 'performance' ? '#6366f1' : 'var(--text-secondary)',
                border: activeTab === 'performance' ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid transparent',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem'
              }}
            >
              Performance
            </button>
          </div>
          
          {activeTab !== 'performance' && (
            <button
              onClick={() => {
                // Custom popup trigger
                setEditingTxId(null);
                setFormSymbol('');
                setFormName('');
                setFormUrlPath('');
                setFormType('BUY');
                setFormQuantity('');
                setFormPrice('');
                setFormDate(new Date().toISOString().split('T')[0]);
                setFormDateDisplay(toDisplayDate(new Date().toISOString().split('T')[0]));
                setFormNotes('');
                setFormError('');
                setFormAccountId(selectedAccountId || defaultAccountId || (accounts.length > 0 ? accounts[0].id : ''));
                if (dialogRef.current) dialogRef.current.showModal();
              }}
              className="btn btn-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.8125rem' }}
            >
              <Plus size={16} />
              <span>Manual Transaction</span>
            </button>
          )}
        </div>

        {/* Table 1: Current Holdings */}
        {activeTab === 'holdings' && (
          <div className="custom-table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '28px' }}></th>
                  <th>Equity / Stock</th>
                  <th>Qty</th>
                  <th>Avg. Cost</th>
                  <th>Curr. Price</th>
                  <th
                    onClick={() => {
                      if (holdingsSortCol === 'investedValue') {
                        setHoldingsSortDir(d => d === 'desc' ? 'asc' : 'desc');
                      } else {
                        setHoldingsSortCol('investedValue');
                        setHoldingsSortDir('desc');
                      }
                    }}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      Invested
                      <span style={{ fontSize: '0.65rem', opacity: holdingsSortCol === 'investedValue' ? 1 : 0.3 }}>
                        {holdingsSortCol === 'investedValue' ? (holdingsSortDir === 'desc' ? '▼' : '▲') : '⇅'}
                      </span>
                    </span>
                  </th>
                  <th
                    onClick={() => {
                      if (holdingsSortCol === 'currentValue') {
                        setHoldingsSortDir(d => d === 'desc' ? 'asc' : 'desc');
                      } else {
                        setHoldingsSortCol('currentValue');
                        setHoldingsSortDir('desc');
                      }
                    }}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      Mkt Value
                      <span style={{ fontSize: '0.65rem', opacity: holdingsSortCol === 'currentValue' ? 1 : 0.3 }}>
                        {holdingsSortCol === 'currentValue' ? (holdingsSortDir === 'desc' ? '▼' : '▲') : '⇅'}
                      </span>
                    </span>
                  </th>
                  <th>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: '1.2', whiteSpace: 'nowrap' }}>
                      <span>Day's Gain</span>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'none' }}>% Change</span>
                    </div>
                  </th>
                  <th>Returns</th>
                  <th>Term</th>
                  <th>Notes</th>
                  {!selectedAccountId && <th>Account</th>}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const sortedHoldings = [...holdings].sort((a, b) => {
                    const av = holdingsSortCol === 'currentValue' ? a.currentValue : a.investedValue;
                    const bv = holdingsSortCol === 'currentValue' ? b.currentValue : b.investedValue;
                    return holdingsSortDir === 'desc' ? bv - av : av - bv;
                  });
                  return sortedHoldings.length === 0 ? (
                  <tr>
                    <td colSpan={selectedAccountId ? 11 : 12} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      No equities held. Search above to record your first transaction!
                    </td>
                  </tr>
                ) : (
                  sortedHoldings.map((item) => {
                    const gain = item.profitLoss >= 0;
                    const holdingKey = item.symbol;
                    const isExpanded = expandedHoldings.has(holdingKey);
                    const hasMultipleLots = item.lots && item.lots.length > 1;
                    const isLongTerm = item.termType === 'Long Term';
                    const uniqueNotes = [...new Set(item.lots.map(l => l.notes).filter(Boolean))];
                    return (
                      <React.Fragment key={holdingKey}>
                        {/* Main holding row */}
                        <tr style={{ borderBottom: isExpanded ? 'none' : undefined }}>
                          {/* Expand toggle */}
                          <td style={{ padding: '0.75rem 0.5rem 0.75rem 0.75rem', width: '28px' }}>
                            {hasMultipleLots ? (
                              <button
                                onClick={() => toggleHoldingExpand(holdingKey)}
                                className="btn-icon"
                                title={isExpanded ? 'Collapse lots' : `Show ${item.lots.length} lots`}
                                style={{ padding: '0.2rem', color: '#6366f1' }}
                              >
                                {isExpanded
                                  ? <ChevronDown size={14} />
                                  : <ChevronRight size={14} />}
                              </button>
                            ) : <span style={{ display: 'inline-block', width: '22px' }} />}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                <strong style={{ color: '#ffffff', fontSize: '0.9375rem' }}>{item.symbol}</strong>
                                {hasMultipleLots && (
                                  <span style={{
                                    fontSize: '0.625rem', fontWeight: 700,
                                    background: 'rgba(99,102,241,0.15)', color: '#6366f1',
                                    padding: '0.1rem 0.35rem', borderRadius: '9999px'
                                  }}>{item.lots.length} lots</span>
                                )}
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.name}</span>
                            </div>
                          </td>
                          <td style={{ fontWeight: 600 }}>{item.quantity}</td>
                          <td>₹{item.avgBuyPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ fontWeight: 600 }}>
                            ₹{item.currentPrice ? item.currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                            {item.error && (
                              <span style={{ color: 'var(--danger)', display: 'block', fontSize: '0.625rem', fontWeight: 400 }}>Quote Failed</span>
                            )}
                          </td>
                          <td>₹{item.investedValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                          <td style={{ fontWeight: 600 }}>₹{item.currentValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                          <td>
                            {(() => {
                              const daysGain = item.daysGainAmount || 0;
                              const changePct = item.changePercent;
                              if (changePct === null || changePct === undefined) {
                                return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                              }
                              const isDaysGainProfit = changePct >= 0;
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                                  <span style={{ 
                                    color: isDaysGainProfit ? 'var(--success)' : 'var(--danger)', 
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {isDaysGainProfit ? '+' : ''}₹{daysGain.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                  </span>
                                  <span style={{ 
                                    color: isDaysGainProfit ? 'var(--success)' : 'var(--danger)',
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    marginTop: '2px',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {isDaysGainProfit ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                    {changePct.toFixed(2)}%
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ color: gain ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                {gain ? '+' : ''}₹{item.profitLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </span>
                              <span className={`badge ${gain ? 'badge-success' : 'badge-danger'}`} style={{ alignSelf: 'flex-start', marginTop: '2px', fontSize: '0.6875rem' }}>
                                {gain ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                {item.profitLossPercentage.toFixed(2)}%
                              </span>
                            </div>
                          </td>
                          {/* Term column */}
                          <td>
                            <span className={`badge ${isLongTerm ? 'badge-long-term' : 'badge-short-term'}`}>
                              <Clock size={10} />
                              {item.termType}
                            </span>
                          </td>
                          {/* Notes column */}
                          <td>
                            {uniqueNotes.length > 0 ? (
                              <div className="notes-tooltip-wrapper" title={uniqueNotes.join('\n')}>
                                <MessageSquare size={15} style={{ color: '#a855f7', cursor: 'pointer' }} />
                                <div className="notes-tooltip">
                                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#a855f7', display: 'block', marginBottom: '0.25rem' }}>
                                    Notes ({uniqueNotes.length})
                                  </span>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                    {uniqueNotes.map((note, idx) => (
                                      <div key={idx} style={{ 
                                        paddingBottom: idx < uniqueNotes.length - 1 ? '0.375rem' : '0',
                                        borderBottom: idx < uniqueNotes.length - 1 ? '1px solid rgba(168, 85, 247, 0.15)' : 'none'
                                      }}>
                                        {note}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                            )}
                          </td>
                          {/* Account badge(s) — only shown in All Accounts view */}
                          {!selectedAccountId && (
                            <td>
                              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {item.accountIds && item.accountIds.length > 0 ? (
                                  item.accountIds.map(accId => {
                                    const accIdx = accounts.findIndex(a => a.id === accId);
                                    const accObj = accounts[accIdx];
                                    if (!accObj) return null;
                                    const color = ACCOUNT_COLORS[accIdx % ACCOUNT_COLORS.length];
                                    return (
                                      <span
                                        key={accId}
                                        className="account-badge"
                                        style={{
                                          color,
                                          borderColor: color + '40',
                                          background: color + '18'
                                        }}
                                      >
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                                        {accObj.name}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                                )}
                              </div>
                            </td>
                          )}
                          <td>
                            <div style={{ display: 'flex', gap: '0.375rem' }}>
                              <button
                                onClick={() => showHoldingDetails(item)}
                                title="Stock Financials"
                                className="btn btn-secondary"
                                style={{ padding: '0.375rem', borderRadius: 'var(--radius-sm)' }}
                              >
                                <Info size={14} />
                              </button>
                              <button
                                onClick={() => openTransactionDialog(item.symbol, item.name, item.urlPath, 'BUY')}
                                title="Buy More"
                                className="btn btn-success"
                                style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)' }}
                              >
                                BUY
                              </button>
                              <button
                                onClick={() => openTransactionDialog(item.symbol, item.name, item.urlPath, 'SELL')}
                                title="Sell Shares"
                                className="btn btn-secondary"
                                style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', borderColor: 'rgba(244,63,94,0.3)', color: '#f43f5e' }}
                              >
                                SELL
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded lot rows */}
                        {isExpanded && hasMultipleLots && item.lots.map((lot, lotIdx) => {
                          const lotGain = lot.lotPL >= 0;
                          const lotIsLT = lot.termType === 'Long Term';
                          return (
                            <tr key={`${item.symbol}-lot-${lotIdx}`} style={{
                              background: 'rgba(99, 102, 241, 0.03)',
                              borderLeft: '3px solid rgba(99,102,241,0.25)'
                            }}>
                              {/* indent spacer */}
                              <td style={{ padding: '0.5rem 0.5rem 0.5rem 0.75rem' }}>
                                <span style={{ display: 'block', width: '10px', borderBottom: '1px dashed rgba(99,102,241,0.3)', marginLeft: '8px' }} />
                              </td>
                              <td style={{ paddingLeft: '0.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                    Lot {lotIdx + 1} — {fmtDate(lot.date)}
                                    {!selectedAccountId && (() => {
                                      const acc = accounts.find(a => a.id === lot.accountId);
                                      return acc ? ` (${acc.name})` : '';
                                    })()}
                                  </span>
                                  {lot.notes && (
                                    <span style={{ fontSize: '0.7rem', color: '#a855f7', marginTop: '2px', fontStyle: 'italic' }}>
                                      📝 {lot.notes}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{lot.quantity}</td>
                              <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>₹{lot.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>₹{lot.currentPrice ? lot.currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                              <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>₹{lot.lotInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                              <td style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>₹{lot.lotValue ? lot.lotValue.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '-'}</td>
                              <td>
                                {(() => {
                                  const changePct = item.changePercent;
                                  if (changePct === null || changePct === undefined) {
                                    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                                  }
                                  const prevPrice = lot.currentPrice / (1 + changePct / 100);
                                  const lotDaysGainAmount = lot.quantity * (lot.currentPrice - prevPrice);
                                  const isDaysGainProfit = changePct >= 0;
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                                      <span style={{ 
                                        color: isDaysGainProfit ? 'var(--success)' : 'var(--danger)', 
                                        fontWeight: 600,
                                        fontSize: '0.8125rem',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {isDaysGainProfit ? '+' : ''}₹{lotDaysGainAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                      </span>
                                      <span style={{ 
                                        color: isDaysGainProfit ? 'var(--success)' : 'var(--danger)',
                                        fontSize: '0.7rem',
                                        fontWeight: 500,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '2px',
                                        marginTop: '2px',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {isDaysGainProfit ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
                                        {changePct.toFixed(2)}%
                                      </span>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '0.8125rem', color: lotGain ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                    {lotGain ? '+' : ''}₹{lot.lotPL.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                  </span>
                                  <span className={`badge ${lotGain ? 'badge-success' : 'badge-danger'}`} style={{ alignSelf: 'flex-start', marginTop: '2px', fontSize: '0.625rem' }}>
                                    {lotGain ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
                                    {lot.lotPLPct.toFixed(2)}%
                                  </span>
                                </div>
                              </td>
                              <td>
                                <span className={`badge ${lotIsLT ? 'badge-long-term' : 'badge-short-term'}`} style={{ fontSize: '0.625rem' }}>
                                  <Clock size={9} />
                                  {lot.termType}
                                </span>
                              </td>
                              <td /> {/* Spacer for Notes column */}
                              {!selectedAccountId && (() => {
                                const accIdx = accounts.findIndex(a => a.id === lot.accountId);
                                const accObj = accounts[accIdx];
                                if (!accObj) return <td />;
                                const color = ACCOUNT_COLORS[accIdx % ACCOUNT_COLORS.length];
                                return (
                                  <td>
                                    <span
                                      className="account-badge"
                                      style={{
                                        color,
                                        borderColor: color + '40',
                                        background: color + '18',
                                        fontSize: '0.6875rem',
                                        padding: '0.1rem 0.35rem'
                                      }}
                                    >
                                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                                      {accObj.name}
                                    </span>
                                  </td>
                                );
                              })()}
                              <td /> {/* Spacer for Actions column */}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                ) })()}
              </tbody>
            </table>
          </div>
        )}

        {/* Table 2: Transactions List */}
        {activeTab === 'transactions' && (
          <div className="custom-table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Equity</th>
                  <th>Action</th>
                  <th>Shares</th>
                  <th>Price</th>
                  <th>Total Capital</th>
                  <th>Term</th>
                  <th>Notes</th>
                  {!selectedAccountId && <th>Account</th>}
                  <th>Manage</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={selectedAccountId ? 9 : 10} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      No transactions recorded.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const isBuy = tx.type === 'BUY';
                    const txMonths = (new Date() - new Date(tx.date)) / (1000 * 60 * 60 * 24 * 30.44);
                    const txIsLT = txMonths >= 12;
                    return (
                      <tr key={tx.id}>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Calendar size={14} />
                            <span>{fmtDate(tx.date)}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <strong style={{ color: '#ffffff' }}>{tx.symbol}</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.name}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${isBuy ? 'badge-success' : 'badge-danger'}`} style={{ letterSpacing: '0.05em' }}>
                            {tx.type}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{tx.quantity}</td>
                        <td>₹{tx.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ fontWeight: 600 }}>
                          ₹{(tx.quantity * tx.price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td>
                          <span className={`badge ${txIsLT ? 'badge-long-term' : 'badge-short-term'}`}>
                            <Clock size={10} />
                            {txIsLT ? 'Long Term' : 'Short Term'}
                          </span>
                        </td>
                        {/* Notes tooltip */}
                        <td>
                          {tx.notes ? (
                            <div className="notes-tooltip-wrapper" title={tx.notes}>
                              <MessageSquare size={15} style={{ color: '#a855f7', cursor: 'pointer' }} />
                              <div className="notes-tooltip">
                                <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#a855f7', display: 'block', marginBottom: '0.25rem' }}>Note</span>
                                {tx.notes}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                          )}
                        </td>
                        {/* Account column in All Accounts view */}
                        {!selectedAccountId && (() => {
                          const accIdx = accounts.findIndex(a => a.id === tx.accountId);
                          const accObj = accounts[accIdx];
                          const color = accObj ? ACCOUNT_COLORS[accIdx % ACCOUNT_COLORS.length] : '#64748b';
                          return (
                            <td>
                              {accObj ? (
                                <span
                                  className="account-badge"
                                  style={{
                                    color,
                                    borderColor: color + '40',
                                    background: color + '18'
                                  }}
                                >
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                                  {accObj.name}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                              )}
                            </td>
                          );
                        })()}
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                              onClick={() => handleEditTransaction(tx)}
                              className="btn-icon"
                              style={{ color: '#6366f1' }}
                              title="Edit transaction"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="btn-icon"
                              style={{ color: '#f43f5e' }}
                              title="Delete transaction"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {activeTab === 'performance' ? (
          <Performance user={user} />
        ) : null}
      </section>

      {/* MODAL 1: ADD TRANSACTION DIALOG */}
      <dialog 
        ref={dialogRef} 
        onClose={() => setEditingTxId(null)}
        className="glass-panel" 
        style={{ border: '1px solid rgba(255, 255, 255, 0.15)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: '700' }}>
            {editingTxId ? 'Edit' : 'Record'} {formType} Transaction
          </h2>
          <button 
            onClick={() => dialogRef.current.close()} 
            className="btn-icon" 
            style={{ padding: '0.25rem' }}
          >
            <X size={20} />
          </button>
        </div>

        {formError && (
          <div className="glow-danger" style={{
            backgroundColor: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.2)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.5rem 0.75rem',
            color: '#f43f5e',
            fontSize: '0.8125rem',
            marginBottom: '1rem'
          }}>
            {formError}
          </div>
        )}

        <form onSubmit={handleAddTransactionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Account Selector */}
          {accounts.length > 0 && (
            <div>
              <label className="form-label">Portfolio Account</label>
              <select
                className="form-input"
                value={formAccountId}
                onChange={e => setFormAccountId(e.target.value)}
                required
                style={{ cursor: 'pointer' }}
              >
                <option value="" disabled>Select an account…</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Transactions are tracked separately per account.
              </span>
            </div>
          )}

          {/* BUY vs SELL toggler */}
          <div>
            <span className="form-label">Transaction Type</span>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              background: 'rgba(0, 0, 0, 0.2)',
              padding: '3px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--card-border)'
            }}>
              <button
                type="button"
                onClick={() => setFormType('BUY')}
                style={{
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  backgroundColor: formType === 'BUY' ? 'var(--success)' : 'transparent',
                  color: formType === 'BUY' ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'var(--transition-all)'
                }}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setFormType('SELL')}
                style={{
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  backgroundColor: formType === 'SELL' ? 'var(--danger)' : 'transparent',
                  color: formType === 'SELL' ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'var(--transition-all)'
                }}
              >
                SELL
              </button>
            </div>
          </div>

          {/* Symbol & Name Details */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: '0.75rem'
          }}>
            <div>
              <label className="form-label">Symbol</label>
              <input
                type="text"
                placeholder="RELIANCE"
                className="form-input"
                style={{ textTransform: 'uppercase' }}
                value={formSymbol}
                onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                required
              />
            </div>
            <div>
              <label className="form-label">Company Name</label>
              <input
                type="text"
                placeholder="Reliance Industries"
                className="form-input"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="form-label">Screener.in URL Path</label>
            <input
              type="text"
              placeholder="/company/RELIANCE/consolidated/ (optional)"
              className="form-input"
              value={formUrlPath}
              onChange={(e) => setFormUrlPath(e.target.value)}
              required
            />
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Used to match and scrape live stock prices. Matches autocomplete exactly.
            </span>
          </div>

          {/* Quantity and Price */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem'
          }}>
            <div>
              <label className="form-label">Quantity (Shares)</label>
              <input
                type="number"
                step="any"
                min="0.0001"
                placeholder="10"
                className="form-input"
                value={formQuantity}
                onChange={(e) => setFormQuantity(e.target.value)}
                required
              />
            </div>
            <div style={{ position: 'relative' }}>
              <label className="form-label">Price per Share (₹)</label>
              <input
                type="number"
                step="any"
                min="0.01"
                placeholder="1450"
                className="form-input"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                disabled={formLoading}
                required
              />
              {formLoading && (
                <span style={{ position: 'absolute', right: '12px', bottom: '12px' }}>
                  <div style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255,255,255,0.05)',
                    borderTopColor: '#6366f1',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                </span>
              )}
            </div>
          </div>

          {/* Date — masked DD/MM/YYYY text input */}
          <div>
            <label className="form-label">Transaction Date</label>
            <input
              type="text"
              className="form-input"
              value={formDateDisplay}
              placeholder="DD/MM/YYYY"
              maxLength={10}
              required
              onChange={e => {
                // Strip everything except digits
                const digits = e.target.value.replace(/\D/g, '');

                // Auto-format: insert slashes after DD and MM
                let display = '';
                if (digits.length > 0) display = digits.slice(0, 2);
                if (digits.length > 2) display += '/' + digits.slice(2, 4);
                if (digits.length > 4) display += '/' + digits.slice(4, 8);

                setFormDateDisplay(display);

                // Update internal YYYY-MM-DD only when complete (8 digits)
                if (digits.length === 8) {
                  const dd = digits.slice(0, 2);
                  const mm = digits.slice(2, 4);
                  const yyyy = digits.slice(4, 8);
                  const d = parseInt(dd, 10);
                  const m = parseInt(mm, 10);
                  const y = parseInt(yyyy, 10);
                  if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000 && y <= 2099) {
                    setFormDate(`${yyyy}-${mm}-${dd}`);
                  }
                }
              }}
              onKeyDown={e => {
                // Allow: backspace, delete, tab, arrows, ctrl shortcuts
                const allowedKeys = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
                if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;
                // Block non-digit keys (slashes are auto-inserted)
                if (!/^\d$/.test(e.key)) e.preventDefault();
              }}
              style={{ letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}
            />
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Type digits — slashes added automatically
            </span>
          </div>

          {/* Notes */}
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <MessageSquare size={13} />
              Notes <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              className="form-input"
              placeholder="e.g. Bought on dip, earnings play, long-term hold…"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              style={{ resize: 'vertical', minHeight: '56px', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={() => dialogRef.current.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              {editingTxId ? 'Update Transaction' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </dialog>

      {/* MODAL 2: HOLDING RATIOS INFO DIALOG */}
      <dialog ref={detailsDialogRef} className="glass-panel" style={{ maxWidth: '460px' }}>
        {selectedHolding && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: '700', color: '#ffffff' }}>
                  {selectedHolding.symbol} Financials
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{selectedHolding.name}</span>
              </div>
              <button 
                onClick={() => detailsDialogRef.current.close()} 
                className="btn-icon" 
                style={{ padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Current Market Price</span>
                <strong style={{ color: '#ffffff' }}>₹{selectedHolding.currentPrice ? selectedHolding.currentPrice.toLocaleString('en-IN') : '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Market Capitalization</span>
                <strong style={{ color: '#ffffff' }}>₹{selectedHolding.ratios?.marketCap ? selectedHolding.ratios.marketCap.toLocaleString('en-IN') + ' Cr.' : '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Stock P/E Ratio</span>
                <strong style={{ color: '#ffffff' }}>{selectedHolding.ratios?.peRatio || '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Book Value per Share</span>
                <strong style={{ color: '#ffffff' }}>₹{selectedHolding.ratios?.bookValue || '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Dividend Yield</span>
                <strong style={{ color: '#ffffff' }}>{selectedHolding.ratios?.dividendYield ? selectedHolding.ratios.dividendYield + '%' : '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Return on Capital (ROCE)</span>
                <strong style={{ color: '#ffffff' }}>{selectedHolding.ratios?.roce ? selectedHolding.ratios.roce + '%' : '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Return on Equity (ROE)</span>
                <strong style={{ color: '#ffffff' }}>{selectedHolding.ratios?.roe ? selectedHolding.ratios.roe + '%' : '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Face Value</span>
                <strong style={{ color: '#ffffff' }}>₹{selectedHolding.ratios?.faceValue || '-'}</strong>
              </div>
            </div>

            <button
              onClick={() => detailsDialogRef.current.close()}
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '1.5rem' }}
            >
              Close Details
            </button>
          </>
        )}
      </dialog>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin-animation {
          animation: spin 1.2s linear infinite;
        }
        .badge-long-term {
          background: rgba(20, 184, 166, 0.12);
          color: #14b8a6;
          border: 1px solid rgba(20, 184, 166, 0.2);
        }
        .badge-short-term {
          background: rgba(245, 158, 11, 0.12);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.2);
        }
        .notes-tooltip-wrapper {
          position: relative;
          display: inline-flex;
          align-items: center;
        }
        .notes-tooltip {
          display: none;
          position: absolute;
          bottom: calc(100% + 8px);
          right: 0;
          min-width: 220px;
          max-width: 300px;
          background: #0f172a;
          border: 1px solid rgba(168, 85, 247, 0.3);
          border-radius: 8px;
          padding: 0.625rem 0.75rem;
          font-size: 0.8125rem;
          color: var(--text-primary);
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          z-index: 200;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.5;
          pointer-events: none;
        }
        .notes-tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          right: 4px;
          border: 6px solid transparent;
          border-top-color: rgba(168, 85, 247, 0.3);
        }
        .notes-tooltip-wrapper:hover .notes-tooltip {
          display: block;
        }
      `}</style>
    </div>
  );
}

export default Dashboard;

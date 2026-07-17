import React, { useState, useEffect } from 'react';
import { RefreshCw, Plus } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const INITIAL_DATA = [
  { id: 'inv', type: 'fund', label: 'Invested Fund', value: 39.5, pocBase: 40.00 },
  { id: '2014', type: 'year', age: 31, year: 2014, value: 55.86, nifty: 33 },
  { id: 'f2015', type: 'fund', label: 'Fund Added in 2015', value: 27.8 },
  { id: '2015', type: 'year', age: 32, year: 2015, value: 111, nifty: -5 },
  { id: 'f2016', type: 'fund', label: 'Fund Added in 2016', value: 4.5 },
  { id: '2016', type: 'year', age: 33, year: 2016, value: 105.75, nifty: 3 },
  { id: 'f2017', type: 'fund', label: 'Fund Added in 2017', value: 8.5 },
  { id: '2017', type: 'year', age: 34, year: 2017, value: 222.70, nifty: 28.6 },
  { id: 'f2018', type: 'fund', label: 'Fund Added in 2018', value: 8.0 },
  { id: '2018', type: 'year', age: 35, year: 2018, value: 143.0, nifty: 4 },
  { id: '2019', type: 'year', age: 36, year: 2019, value: 119.42, nifty: 12 },
  { id: '2020', type: 'year', age: 37, year: 2020, value: 139.10, nifty: 14.17 },
  { id: '2021', type: 'year', age: 38, year: 2021, value: 248.18, nifty: 24.12 },
  { id: '2022', type: 'year', age: 39, year: 2022, value: 241.87, nifty: 4.32 },
  { id: '2023', type: 'year', age: 40, year: 2023, value: 322.93, nifty: 20 },
  { id: 'f2024', type: 'fund', label: 'Fund Added in 2024', value: 8.0 },
  { id: '2024', type: 'year', age: 41, year: 2024, value: 402.10, nifty: 9 },
  { id: 'f2025_1', type: 'fund', label: 'Fund Added in 2025 - Mom AW Fund', value: 15.0 },
  { id: 'f2025_2', type: 'fund', label: 'Trust and Parag MF 2025 - Mom AW Fund', value: 10.0 },
  { id: 'f2025_3', type: 'fund', label: 'Motilal Received', value: 5.5 },
  { id: '2025', type: 'year', age: 42, year: 2025, value: 404.63, nifty: 10.5 },
  { id: 'f2026', type: 'fund', label: 'LandSell', value: 90.0 },
];

for (let y = 2026; y <= 2043; y++) {
  INITIAL_DATA.push({ id: y.toString(), type: 'year', age: y - 2026 + 43, year: y, value: null, nifty: null });
}

export default function Performance({ user }) {
  const [data, setData] = useState([]);
  const [loadingPerf, setLoadingPerf] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchPerf = async () => {
      try {
        const perfDoc = await getDoc(doc(db, 'performance', user.id));
        if (perfDoc.exists()) {
          setData(perfDoc.data().rows);
        } else {
          setData(INITIAL_DATA);
        }
      } catch (err) {
        console.error("Error fetching performance data:", err);
        setData(INITIAL_DATA);
      } finally {
        setLoadingPerf(false);
      }
    };
    fetchPerf();
  }, [user]);

  const handleValueChange = async (index, newValueStr) => {
    const newData = [...data];
    const val = newValueStr === '' ? null : parseFloat(newValueStr);
    newData[index] = { ...newData[index], value: val };
    
    setData(newData);
    if (user) {
      await setDoc(doc(db, 'performance', user.id), { rows: newData });
    }
  };

  const handleAddFund = () => {
    const yearStr = window.prompt("Enter the Year this fund was added (e.g. 2027):");
    if (!yearStr) return;
    const yearNum = parseInt(yearStr, 10);
    if (isNaN(yearNum)) {
      alert("Invalid year. Please enter a valid number.");
      return;
    }

    const labelStr = window.prompt("Enter a label/name for this fund (e.g. 'Bonus'):") || `Fund Added in ${yearNum}`;
    
    const newData = [...data];
    const insertIndex = newData.findIndex(r => r.type === 'year' && r.year === yearNum);
    
    if (insertIndex === -1) {
      alert(`Year ${yearNum} not found in the table. Please choose a year between 2014 and 2043.`);
      return;
    }

    const newFund = {
      id: `f${yearNum}_${Date.now()}`,
      type: 'fund',
      label: labelStr,
      value: null
    };

    newData.splice(insertIndex, 0, newFund);
    setData(newData);
    if (user) {
      setDoc(doc(db, 'performance', user.id), { rows: newData });
    }
  };

  const calculateTable = () => {
    const calculated = [];
    
    let lastPortfolioValue = null;
    let fundsAddedSinceLastYear = 0;
    
    let poc18 = 0;
    let poc14 = 0;
    let poc12 = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const result = { ...row };

      if (i === 0) {
        // Base initialization
        poc18 = row.pocBase;
        poc14 = row.pocBase;
        poc12 = row.pocBase;
        lastPortfolioValue = row.value || 0;
        
        result.poc18 = poc18;
        result.poc14 = poc14;
        result.poc12 = poc12;
      } else {
        if (row.type === 'fund') {
          const added = row.value || 0;
          fundsAddedSinceLastYear += added;
          result.poc18 = added;
          result.poc14 = added;
          result.poc12 = added;
        } else if (row.type === 'year') {
          // Calculate POC values for the year
          poc18 = (poc18 + fundsAddedSinceLastYear) * 1.18;
          poc14 = (poc14 + fundsAddedSinceLastYear) * 1.14;
          poc12 = (poc12 + fundsAddedSinceLastYear) * 1.12;
          
          result.poc18 = poc18;
          result.poc14 = poc14;
          result.poc12 = poc12;
          
          // Calculate Percentage Gain
          const currentVal = row.value;
          if (currentVal !== null && lastPortfolioValue !== null) {
            const basis = lastPortfolioValue + fundsAddedSinceLastYear;
            if (basis !== 0) {
              result.percentageGain = ((currentVal - basis) / basis) * 100;
            } else {
              result.percentageGain = null;
            }
          } else {
            result.percentageGain = null; // Either current or past is missing
          }

          // Update state for next year
          if (currentVal !== null) {
            lastPortfolioValue = currentVal;
            fundsAddedSinceLastYear = 0;
          }
        }
      }
      calculated.push(result);
    }
    
    return calculated;
  };

  const formatNumber = (num, decimals = 2) => {
    if (num === null || num === undefined || isNaN(num)) return '';
    return num.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const formatPercent = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '';
    return `${num.toFixed(2)}%`;
  };

  const rows = calculateTable();

  return (
    <div className="card" style={{ marginTop: '1.5rem', animation: 'fadeIn 0.3s ease' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', padding: '1.5rem', borderBottom: '1px solid var(--card-border)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Portfolio Performance Tracking</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Track portfolio value against compound growth targets.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleAddFund}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}
          >
            <Plus size={14} />
            Add Fund
          </button>
          <button
            onClick={async () => {
              if (window.confirm('Are you sure you want to reset all performance data to initial values?')) {
                setData(INITIAL_DATA);
                if (user) {
                  await setDoc(doc(db, 'performance', user.id), { rows: INITIAL_DATA });
                }
              }
            }}
            className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}
          >
            <RefreshCw size={14} />
            Reset Data
          </button>
        </div>
      </div>
      
      <div className="custom-table-container" style={{ margin: '1.5rem' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>Age</th>
              <th>Year (31st Dec)</th>
              <th style={{ textAlign: 'right' }}>Portfolio Value (Lakhs)</th>
              <th style={{ textAlign: 'right' }}>Percentage Gain</th>
              <th style={{ textAlign: 'right' }}>Nifty Return</th>
              <th style={{ textAlign: 'right', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', borderLeft: '1px solid rgba(16, 185, 129, 0.2)' }}>POC with 18%</th>
              <th style={{ textAlign: 'right', borderLeft: '1px solid var(--card-border)' }}>POC with 14%</th>
              <th style={{ textAlign: 'right', borderLeft: '1px solid var(--card-border)' }}>POC with 12%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isFund = row.type === 'fund';
              
              let rowStyle = {};
              if (isFund) {
                rowStyle = { backgroundColor: 'rgba(37, 99, 235, 0.15)', borderTop: '1px solid rgba(59, 130, 246, 0.3)', borderBottom: '1px solid rgba(59, 130, 246, 0.3)' };
              } else if (index % 2 === 0) {
                rowStyle = { backgroundColor: 'rgba(255, 255, 255, 0.015)' };
              }
              
              return (
                <tr key={index} style={rowStyle}>
                  {isFund ? (
                    <td colSpan={2} style={{ color: '#60a5fa', fontWeight: 500 }}>
                      {row.label || row.year}
                    </td>
                  ) : (
                    <>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {row.age || ''}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {row.label || row.year}
                      </td>
                    </>
                  )}
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      step="any"
                      value={row.value === null ? '' : row.value}
                      onChange={(e) => handleValueChange(index, e.target.value)}
                      style={{
                        backgroundColor: 'rgba(0,0,0,0.2)',
                        border: isFund ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(255,255,255,0.1)',
                        color: isFund ? '#60a5fa' : 'white',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '0.875rem',
                        textAlign: 'right',
                        width: '100px',
                        outline: 'none'
                      }}
                      placeholder="0.00"
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {row.percentageGain !== null && row.percentageGain !== undefined ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        backgroundColor: row.percentageGain > 0 ? 'rgba(16, 185, 129, 0.1)' : (row.percentageGain < 0 ? 'rgba(244, 63, 94, 0.1)' : 'transparent'),
                        color: row.percentageGain > 0 ? '#4ade80' : (row.percentageGain < 0 ? '#f87171' : 'var(--text-secondary)'),
                        border: row.percentageGain > 0 ? '1px solid rgba(16, 185, 129, 0.2)' : (row.percentageGain < 0 ? '1px solid rgba(244, 63, 94, 0.2)' : 'none')
                      }}>
                        {row.percentageGain > 0 ? '+' : ''}{formatPercent(row.percentageGain)}
                      </span>
                    ) : ''}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {row.nifty !== null && row.nifty !== undefined ? (
                      <span style={{
                        color: row.nifty > 0 ? '#4ade80' : (row.nifty < 0 ? '#f87171' : 'var(--text-muted)'),
                        fontSize: '0.75rem'
                      }}>
                        {row.nifty > 0 ? '+' : ''}{row.nifty}%
                      </span>
                    ) : ''}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderLeft: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    {formatNumber(row.poc18)}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-primary)', borderLeft: '1px solid var(--card-border)' }}>
                    {formatNumber(row.poc14)}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-primary)', borderLeft: '1px solid var(--card-border)' }}>
                    {formatNumber(row.poc12)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

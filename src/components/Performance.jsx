import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

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

export default function Performance() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('indiaportfolio_performance_data');
    if (saved) {
      try {
        setData(JSON.parse(saved));
      } catch (e) {
        setData(INITIAL_DATA);
      }
    } else {
      setData(INITIAL_DATA);
    }
  }, []);

  const handleValueChange = (index, newValueStr) => {
    const newData = [...data];
    const val = newValueStr === '' ? null : parseFloat(newValueStr);
    newData[index] = { ...newData[index], value: val };
    
    setData(newData);
    localStorage.setItem('indiaportfolio_performance_data', JSON.stringify(newData));
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="glass-panel p-6 border-l-4 border-l-indigo-500">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white mb-1">Portfolio Performance Tracking</h2>
            <p className="text-sm text-gray-400">
              Track portfolio value against compound growth targets.
            </p>
          </div>
          <button 
            onClick={() => {
              if(window.confirm('Reset to default values? All manual edits will be lost.')) {
                setData(INITIAL_DATA);
                localStorage.setItem('indiaportfolio_performance_data', JSON.stringify(INITIAL_DATA));
              }
            }}
            className="btn btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reset Data
          </button>
        </div>
        
        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-[rgba(255,255,255,0.02)] border-b border-[rgba(255,255,255,0.05)]">
                <th className="p-4 font-semibold text-sm text-gray-400 pl-4">Age</th>
                <th className="p-4 font-semibold text-sm text-gray-400">Year (31st Dec)</th>
                <th className="p-4 font-semibold text-sm text-gray-400 text-right">Portfolio Value (Lakhs)</th>
                <th className="p-4 font-semibold text-sm text-gray-400 text-right">Percentage Gain</th>
                <th className="p-4 font-semibold text-sm text-gray-400 text-right">Nifty Return</th>
                <th className="p-4 font-semibold text-sm text-[#10b981] text-right bg-[#10b981]/10 border-l border-[#10b981]/20">POC with 18%</th>
                <th className="p-4 font-semibold text-sm text-gray-400 text-right border-l border-[rgba(255,255,255,0.05)]">POC with 14%</th>
                <th className="p-4 font-semibold text-sm text-gray-400 text-right border-l border-[rgba(255,255,255,0.05)] pr-4">POC with 12%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isFund = row.type === 'fund';
                const bgClass = isFund ? 'bg-[#2563eb]/20' : (index % 2 === 0 ? 'bg-[rgba(255,255,255,0.02)]' : '');
                const borderClass = isFund ? 'border-y border-[#3b82f6]/40' : 'border-b border-[rgba(255,255,255,0.05)]';
                
                return (
                  <tr key={index} className={`${borderClass} hover:bg-[rgba(255,255,255,0.05)] transition-colors ${bgClass}`}>
                    {isFund ? (
                      <td colSpan={2} className="p-3 text-sm font-medium text-[#60a5fa] pl-4">
                        {row.label || row.year}
                      </td>
                    ) : (
                      <>
                        <td className="p-3 text-sm text-gray-300 pl-4">
                          {row.age || ''}
                        </td>
                        <td className="p-3 text-sm text-gray-300">
                          {row.label || row.year}
                        </td>
                      </>
                    )}
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        step="any"
                        value={row.value === null ? '' : row.value}
                        onChange={(e) => handleValueChange(index, e.target.value)}
                        className={`bg-[rgba(0,0,0,0.2)] border ${isFund ? 'border-[#3b82f6]/50 focus:border-[#60a5fa] focus:ring-[#60a5fa] text-[#60a5fa]' : 'border-[rgba(255,255,255,0.1)] focus:border-indigo-500 focus:ring-indigo-500 text-white'} rounded px-2 py-1 text-sm text-right w-28 focus:outline-none focus:ring-1 transition-colors font-medium`}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="p-3 text-sm text-right">
                      {row.percentageGain !== null && row.percentageGain !== undefined ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.percentageGain > 0 ? 'bg-green-500/10 text-green-400 border border-green-500/20' : (row.percentageGain < 0 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'text-gray-400')}`}>
                          {row.percentageGain > 0 ? '+' : ''}{formatPercent(row.percentageGain)}
                        </span>
                      ) : ''}
                    </td>
                    <td className="p-3 text-sm text-right text-gray-400">
                      {row.nifty !== null && row.nifty !== undefined ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${row.nifty > 0 ? 'text-green-400/80' : (row.nifty < 0 ? 'text-red-400/80' : 'text-gray-500')}`}>
                          {row.nifty > 0 ? '+' : ''}{row.nifty}%
                        </span>
                      ) : ''}
                    </td>
                    <td className="p-3 text-sm text-right font-semibold text-[#10b981] bg-[#10b981]/5 border-l border-[#10b981]/20">
                      {formatNumber(row.poc18)}
                    </td>
                    <td className="p-3 text-sm text-right font-medium text-gray-300 border-l border-[rgba(255,255,255,0.05)]">
                      {formatNumber(row.poc14)}
                    </td>
                    <td className="p-3 text-sm text-right font-medium text-gray-300 border-l border-[rgba(255,255,255,0.05)] pr-4">
                      {formatNumber(row.poc12)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

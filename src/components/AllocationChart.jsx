import { useState } from 'react';

function AllocationChart({ holdings }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!holdings || holdings.length === 0) {
    return (
      <div style={{
        height: '240px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.875rem'
      }}>
        No stock allocation data available
      </div>
    );
  }

  // Calculate total portfolio value
  const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);

  // Map holdings to sorted list with weights
  const data = holdings
    .map((h, idx) => ({
      symbol: h.symbol,
      name: h.name,
      value: h.currentValue,
      percentage: totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0,
      originalIndex: idx
    }))
    .sort((a, b) => b.value - a.value);

  // Premium neon color palette for chart segments
  const colors = [
    '#6366f1', // Indigo
    '#8b5cf6', // Purple
    '#14b8a6', // Teal
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#f43f5e'  // Rose
  ];

  const getColor = (idx) => colors[idx % colors.length];

  // SVG parameters
  const radius = 60;
  const strokeWidth = 16;
  const size = 180;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Compute stroke offsets
  let currentAccumulated = 0;
  const segments = [];
  for (let idx = 0; idx < data.length; idx++) {
    const item = data[idx];
    const color = getColor(idx);
    const dash = (item.percentage / 100) * circumference;
    const gap = circumference - dash;
    const offset = circumference - (currentAccumulated / 100) * circumference;
    
    currentAccumulated += item.percentage;

    segments.push({
      ...item,
      color,
      dashString: `${dash} ${gap}`,
      offset,
    });
  }

  const activeItem = hoveredIdx !== null ? segments[hoveredIdx] : null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '2rem',
      flexWrap: 'wrap',
      minHeight: '220px'
    }}>
      {/* Interactive Donut SVG */}
      <div style={{ position: 'relative', width: `${size}px`, height: `${size}px`, margin: '0 auto' }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
        >
          {/* Background circle track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.03)"
            strokeWidth={strokeWidth}
          />
          {/* Active segments */}
          {segments.map((segment, idx) => (
            <circle
              key={segment.symbol}
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke={segment.color}
              strokeWidth={hoveredIdx === idx ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={segment.dashString}
              strokeDashoffset={segment.offset}
              strokeLinecap={segment.percentage > 1.5 ? "round" : "butt"}
              style={{
                transition: 'stroke-width 0.2s ease, filter 0.2s ease',
                cursor: 'pointer',
                filter: hoveredIdx === idx ? `drop-shadow(0 0 6px ${segment.color})` : 'none'
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </svg>

        {/* Donut Center Display */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          {activeItem ? (
            <>
              <span style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: '800', color: '#ffffff' }}>
                {activeItem.symbol}
              </span>
              <span style={{ fontSize: '0.8125rem', color: activeItem.color, fontWeight: '600' }}>
                {activeItem.percentage.toFixed(1)}%
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Assets
              </span>
              <span style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: '800', color: 'var(--text-primary)' }}>
                {data.length}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Grid Legend List */}
      <div style={{
        flex: 1,
        minWidth: '200px',
        maxHeight: '200px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        paddingRight: '0.25rem'
      }}>
        {segments.map((item, idx) => (
          <div
            key={item.symbol}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.375rem 0.625rem',
              borderRadius: 'var(--radius-sm)',
              background: hoveredIdx === idx ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
              transition: 'var(--transition-all)',
              cursor: 'pointer'
            }}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: item.color,
                boxShadow: `0 0 8px ${item.color}80`
              }}></div>
              <span style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: hoveredIdx === idx ? '#ffffff' : 'var(--text-primary)'
              }}>
                {item.symbol}
              </span>
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                maxWidth: '120px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }} className="show-from-tablet-landscape">
                {item.name}
              </span>
            </div>
            <span style={{
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'var(--text-secondary)'
            }}>
              ₹{item.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ({item.percentage.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AllocationChart;

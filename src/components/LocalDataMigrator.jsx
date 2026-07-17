import { useState, useEffect } from 'react';
import { Database, UploadCloud } from 'lucide-react';
import { db } from '../firebase';
import { collection, writeBatch, doc, setDoc } from 'firebase/firestore';

export default function LocalDataMigrator({ user, onComplete }) {
  const [hasLocalData, setHasLocalData] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if there is data in local storage
    const accounts = localStorage.getItem('indiaportfolio_accounts');
    const txs = localStorage.getItem('indiaportfolio_txs');
    const perf = localStorage.getItem('indiaportfolio_performance_data');
    if ((accounts && accounts !== '[]') || (txs && txs !== '[]') || perf) {
      setHasLocalData(true);
    }
  }, []);

  const handleMigrate = async () => {
    if (!window.confirm("This will upload all your old local data to the cloud, overwriting any current cloud data. Are you sure?")) {
      return;
    }
    
    setIsMigrating(true);
    setError('');
    try {
      const batch = writeBatch(db);

      const accountsStr = localStorage.getItem('indiaportfolio_accounts');
      if (accountsStr && accountsStr !== '[]') {
        const accounts = JSON.parse(accountsStr);
        accounts.forEach(acc => {
          const docRef = doc(collection(db, 'accounts'));
          // Replace old userId with current Firebase userId
          batch.set(docRef, { ...acc, userId: user.id });
        });
      }

      const txsStr = localStorage.getItem('indiaportfolio_txs');
      if (txsStr && txsStr !== '[]') {
        const txs = JSON.parse(txsStr);
        txs.forEach(tx => {
          const docRef = doc(collection(db, 'transactions'));
          batch.set(docRef, { ...tx, userId: user.id });
        });
      }

      await batch.commit();

      const perfStr = localStorage.getItem('indiaportfolio_performance_data');
      if (perfStr) {
        const perfData = JSON.parse(perfStr);
        await setDoc(doc(db, 'performance', user.id), { rows: perfData });
      }

      // Cleanup local storage to prevent prompt again
      localStorage.removeItem('indiaportfolio_accounts');
      localStorage.removeItem('indiaportfolio_txs');
      localStorage.removeItem('indiaportfolio_performance_data');

      setHasLocalData(false);
      onComplete(); // Trigger a refresh
    } catch (err) {
      console.error(err);
      setError('Migration failed. Check console for details.');
    } finally {
      setIsMigrating(false);
    }
  };

  if (!hasLocalData) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1))',
      border: '1px solid rgba(168, 85, 247, 0.3)',
      borderRadius: '8px',
      padding: '1rem',
      marginBottom: '1rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Database size={24} color="#a855f7" />
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0, color: 'var(--text-primary)' }}>Old Data Found</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
            We detected old portfolio data stored on this browser. Click sync to save it permanently to your new Cloud Database!
          </p>
        </div>
      </div>
      <div>
        <button
          onClick={handleMigrate}
          disabled={isMigrating}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <UploadCloud size={16} />
          {isMigrating ? 'Syncing...' : 'Sync Now'}
        </button>
        {error && <div style={{ color: 'red', fontSize: '0.75rem', marginTop: '0.5rem' }}>{error}</div>}
      </div>
    </div>
  );
}

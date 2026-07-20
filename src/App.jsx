import { useState, useEffect, useRef } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AccountManager from './components/AccountManager';
import { LogOut, Briefcase, ChevronDown, Check, Settings } from 'lucide-react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import LocalDataMigrator from './components/LocalDataMigrator';

// Generate a stable accent color per account index
const ACCOUNT_COLORS = [
  '#6366f1', '#a855f7', '#14b8a6', '#f59e0b',
  '#10b981', '#3b82f6', '#ec4899', '#f43f5e',
  '#8b5cf6', '#06b6d4'
];

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Multi-account state
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null); // null = "All Accounts"
  const [defaultAccountId, setDefaultAccountId] = useState(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger to reload data after migration

  const accountDropdownRef = useRef(null);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({ id: firebaseUser.uid, email: firebaseUser.email, name: firebaseUser.displayName });
      } else {
        setUser(null);
        setAccounts([]);
        setSelectedAccountId(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'accounts'), where('userId', '==', user.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userAccounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAccounts(userAccounts);

      const storedDefault = localStorage.getItem(`indiaportfolio_default_account_${user.id}`);
      if (storedDefault && userAccounts.find(a => a.id === storedDefault)) {
        setDefaultAccountId(storedDefault);
      } else if (userAccounts.length > 0) {
        setDefaultAccountId(userAccounts[0].id);
        localStorage.setItem(`indiaportfolio_default_account_${user.id}`, userAccounts[0].id);
      } else {
        setDefaultAccountId(null);
      }
    }, (error) => {
      console.error("Error fetching accounts:", error);
    });

    return () => unsubscribe();
  }, [user, refreshTrigger]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target)) {
        setShowAccountDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDefaultChange = (accId) => {
    if (!user) return;
    setDefaultAccountId(accId);
    if (accId) {
      localStorage.setItem(`indiaportfolio_default_account_${user.id}`, accId);
    } else {
      localStorage.removeItem(`indiaportfolio_default_account_${user.id}`);
    }
  };

  const handleAccountsChange = (updatedAccounts) => {
    // We can mostly ignore this now because onSnapshot handles real-time updates!
    // But we still need to reset selectedAccountId if the selected account was deleted.
    if (selectedAccountId && !updatedAccounts.find(a => a.id === selectedAccountId)) {
      setSelectedAccountId(null);
    }
  };

  // handleLogout is declared above fetchUser (hoisted for use in fetchUser)

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || null;
  const selectedAccountColor = selectedAccountId
    ? ACCOUNT_COLORS[accounts.findIndex(a => a.id === selectedAccountId) % ACCOUNT_COLORS.length]
    : '#6366f1';

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        gap: '1rem'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid rgba(255,255,255,0.1)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ color: '#94a3b8', fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem' }}>Loading Portfolio...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="app-container">
      {user ? (
        <>
          {/* Global Glass Header */}
          <header className="glass-panel" style={{
            borderRadius: '0 0 16px 16px',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            marginBottom: '2rem',
            position: 'sticky',
            top: 0,
            zIndex: 100
          }}>
            <div className="container" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              height: '70px',
              padding: '0 1.5rem'
            }}>
              {/* Logo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  padding: '0.5rem',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Briefcase size={22} color="#ffffff" />
                </div>
                <h1 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)', fontWeight: '800' }}>
                  India<span style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Portfolio</span>
                </h1>
              </div>

              {/* Center: Account Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* Account Dropdown */}
                <div style={{ position: 'relative' }} ref={accountDropdownRef}>
                  <button
                    className="account-selector-btn"
                    onClick={() => setShowAccountDropdown(prev => !prev)}
                    style={{
                      borderLeft: `3px solid ${selectedAccountColor}`
                    }}
                  >
                    {selectedAccountId ? (
                      <>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: selectedAccountColor,
                            display: 'inline-block',
                            flexShrink: 0
                          }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#fff' }}>
                          {selectedAccount?.name || 'Account'}
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: 'linear-gradient(135deg,#6366f1,#a855f7)',
                          display: 'inline-block', flexShrink: 0
                        }} />
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#fff' }}>
                          All Accounts
                        </span>
                      </>
                    )}
                    <ChevronDown
                      size={14}
                      style={{
                        color: 'var(--text-secondary)',
                        transition: 'transform 0.2s',
                        transform: showAccountDropdown ? 'rotate(180deg)' : 'rotate(0deg)'
                      }}
                    />
                  </button>

                  {showAccountDropdown && (
                    <div className="account-dropdown">
                      {/* All Accounts option */}
                      <button
                        className="account-dropdown-item account-dropdown-item--all"
                        onClick={() => {
                          setSelectedAccountId(null);
                          setShowAccountDropdown(false);
                        }}
                      >
                        <Check
                          size={14}
                          style={{
                            color: selectedAccountId === null ? '#6366f1' : 'transparent',
                            flexShrink: 0
                          }}
                        />
                        <span>All Accounts</span>
                      </button>

                      {accounts.length > 0 && (
                        <div className="account-dropdown-divider" />
                      )}

                      {/* Individual accounts */}
                      {accounts.map((acc, idx) => {
                        const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
                        const isSelected = selectedAccountId === acc.id;
                        const isDefault = defaultAccountId === acc.id;
                        return (
                          <button
                            key={acc.id}
                            className="account-dropdown-item"
                            onClick={() => {
                              setSelectedAccountId(acc.id);
                              setShowAccountDropdown(false);
                            }}
                          >
                            <Check
                              size={14}
                              style={{ color: isSelected ? color : 'transparent', flexShrink: 0 }}
                            />
                            <span
                              style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: color, flexShrink: 0, display: 'inline-block'
                              }}
                            />
                            <span style={{ flex: 1, fontWeight: isSelected ? 600 : 400, color: isSelected ? '#fff' : 'var(--text-primary)' }}>
                              {acc.name}
                            </span>
                            {isDefault && (
                              <span style={{ fontSize: '0.625rem', color: '#f59e0b', flexShrink: 0 }} title="Default account">⭐</span>
                            )}
                          </button>
                        );
                      })}

                      <div className="account-dropdown-divider" />

                      {/* Manage Accounts */}
                      <button
                        className="account-dropdown-item account-dropdown-item--manage"
                        onClick={() => {
                          setShowAccountDropdown(false);
                          setShowAccountManager(true);
                        }}
                      >
                        <Settings size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                        <span>Manage Accounts</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: User info + Logout */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Welcome, <strong style={{ color: 'var(--text-primary)' }}>{user.name}</strong>
                  </span>
                </div>
                <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.8125rem' }}>
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="container animate-fade-in" style={{ paddingBottom: '3rem' }}>
            <LocalDataMigrator user={user} onComplete={() => setRefreshTrigger(prev => prev + 1)} />
            <Dashboard
              user={user}
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              defaultAccountId={defaultAccountId}
            />
          </main>

          {/* Account Manager Modal */}
          <AccountManager
            isOpen={showAccountManager}
            onClose={() => setShowAccountManager(false)}
            userId={user.id}
            accounts={accounts}
            defaultAccountId={defaultAccountId}
            onAccountsChange={handleAccountsChange}
            onDefaultChange={handleDefaultChange}
          />
        </>
      ) : (
        <Login />
      )}
    </div>
  );
}

export default App;

import { useState } from 'react';
import { X, Plus, Trash2, Edit2, Check, Briefcase, Star } from 'lucide-react';
import { db } from '../firebase';
import { doc, addDoc, deleteDoc, updateDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';

const MAX_ACCOUNTS = 10;

function AccountManager({ isOpen, onClose, userId, accounts, defaultAccountId, onAccountsChange, onDefaultChange }) {
  const [newAccountName, setNewAccountName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    const name = newAccountName.trim();
    if (!name) { setError('Account name cannot be empty.'); return; }
    if (accounts.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      setError('An account with this name already exists.');
      return;
    }
    if (accounts.length >= MAX_ACCOUNTS) {
      setError(`Maximum ${MAX_ACCOUNTS} accounts allowed.`);
      return;
    }
    
    try {
      const docRef = await addDoc(collection(db, 'accounts'), {
        userId,
        name,
        createdAt: new Date().toISOString()
      });
      if (accounts.length === 0) {
        onDefaultChange(docRef.id);
      }
      setNewAccountName('');
    } catch (err) {
      setError('Failed to create account.');
      console.error(err);
    }
  };

  const handleDelete = async (accId) => {
    const acc = accounts.find(a => a.id === accId);
    if (!acc) return;

    // Must keep at least 1 account if there are transactions
    const remaining = accounts.filter(a => a.id !== accId);

    const confirmMsg = remaining.length === 0
      ? `Delete account "${acc.name}"?\n\nAll transactions in this account will be unassigned.`
      : `Delete account "${acc.name}"?\n\nAll transactions in this account will be moved to "${remaining[0].name}".`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const targetId = remaining.length > 0 ? remaining[0].id : null;
      
      // Move transactions
      const txsRef = collection(db, 'transactions');
      const q = query(txsRef, where('accountId', '==', accId), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      
      const batch = writeBatch(db);
      snapshot.docs.forEach((txDoc) => {
        batch.update(txDoc.ref, { accountId: targetId });
      });
      await batch.commit();

      // Delete account
      await deleteDoc(doc(db, 'accounts', accId));

      if (editingId === accId) setEditingId(null);
      if (defaultAccountId === accId) {
        onDefaultChange(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      setError('Failed to delete account.');
      console.error(err);
    }
  };

  const startEdit = (acc) => {
    setEditingId(acc.id);
    setEditingName(acc.name);
    setError('');
  };

  const commitEdit = async (accId) => {
    setError('');
    const name = editingName.trim();
    if (!name) { setError('Name cannot be empty.'); return; }
    if (accounts.some(a => a.id !== accId && a.name.toLowerCase() === name.toLowerCase())) {
      setError('An account with this name already exists.');
      return;
    }
    try {
      await updateDoc(doc(db, 'accounts', accId), { name });
      setEditingId(null);
      setEditingName('');
    } catch (err) {
      setError('Failed to update account.');
      console.error(err);
    }
  };

  const accentColors = [
    '#6366f1', '#a855f7', '#14b8a6', '#f59e0b',
    '#10b981', '#3b82f6', '#ec4899', '#f43f5e',
    '#8b5cf6', '#06b6d4'
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: '2rem',
          maxHeight: '90vh',
          overflowY: 'auto',
          animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              padding: '0.4rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Briefcase size={16} color="#fff" />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              Manage Accounts
            </h2>
          </div>
          <button onClick={onClose} className="btn-icon" style={{ padding: '0.25rem' }}>
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Create up to {MAX_ACCOUNTS} portfolio accounts. The ⭐ default account is pre-selected when recording new transactions.
        </p>

        {error && (
          <div style={{
            background: 'rgba(244,63,94,0.1)',
            border: '1px solid rgba(244,63,94,0.25)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.5rem 0.75rem',
            color: '#f43f5e',
            fontSize: '0.8125rem',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        {/* Existing Accounts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {accounts.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '1rem 0' }}>
              No accounts yet. Create one below.
            </p>
          ) : (
            accounts.map((acc, idx) => {
              const color = accentColors[idx % accentColors.length];
              const isEditing = editingId === acc.id;
              const isDefault = defaultAccountId === acc.id;
              return (
                <div
                  key={acc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    background: isDefault ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.03)',
                    border: isDefault ? '1px solid rgba(99,102,241,0.25)' : '1px solid var(--card-border)',
                    borderLeft: `3px solid ${color}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    transition: 'var(--transition-all)'
                  }}
                >
                  {/* Color dot */}
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />

                  {/* Name / Edit input */}
                  {isEditing ? (
                    <input
                      autoFocus
                      type="text"
                      className="form-input"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEdit(acc.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      style={{ flex: 1, padding: '0.375rem 0.625rem', fontSize: '0.875rem' }}
                    />
                  ) : (
                    <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9375rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {acc.name}
                      {isDefault && (
                        <span style={{
                          fontSize: '0.625rem',
                          fontWeight: 700,
                          background: 'rgba(99,102,241,0.15)',
                          color: '#6366f1',
                          border: '1px solid rgba(99,102,241,0.25)',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '9999px',
                          letterSpacing: '0.03em'
                        }}>
                          DEFAULT
                        </span>
                      )}
                    </span>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    {isEditing ? (
                      <button
                        onClick={() => commitEdit(acc.id)}
                        className="btn-icon"
                        title="Save name"
                        style={{ color: 'var(--success)' }}
                      >
                        <Check size={16} />
                      </button>
                    ) : (
                      <>
                        {/* Set as Default */}
                        {!isDefault && (
                          <button
                            onClick={() => onDefaultChange(acc.id)}
                            className="btn-icon"
                            title="Set as default account"
                            style={{ color: '#f59e0b' }}
                          >
                            <Star size={15} />
                          </button>
                        )}
                        {/* Rename */}
                        <button
                          onClick={() => startEdit(acc)}
                          className="btn-icon"
                          title="Rename"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <Edit2 size={15} />
                        </button>
                        {/* Delete — allowed on all accounts */}
                        <button
                          onClick={() => handleDelete(acc.id)}
                          className="btn-icon"
                          title="Delete account"
                          style={{ color: '#f43f5e' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Create new account */}
        {accounts.length < MAX_ACCOUNTS ? (
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.625rem' }}>
            <input
              type="text"
              placeholder="New account name (e.g. Retirement Fund)"
              className="form-input"
              value={newAccountName}
              onChange={e => { setNewAccountName(e.target.value); setError(''); }}
              maxLength={40}
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ padding: '0.625rem 1rem', flexShrink: 0 }}
            >
              <Plus size={16} />
              Create
            </button>
          </form>
        ) : (
          <div style={{
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.8125rem',
            padding: '0.75rem',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--card-border)'
          }}>
            Maximum of {MAX_ACCOUNTS} accounts reached. Delete one to add another.
          </div>
        )}

        <button
          onClick={onClose}
          className="btn btn-secondary"
          style={{ width: '100%', marginTop: '1.5rem' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

export default AccountManager;

import { createFileRoute } from '@tanstack/react-router'
import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from 'react'

export const Route = createFileRoute('/')({
  component: AppRoot,
})

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  errorMessage: string
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'An unexpected error occurred' }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-container">
          <div className="card banner-error" style={{ textAlign: 'center', padding: '32px 20px' }}>
            <h2 style={{ marginBottom: 12 }}>Application Encountered an Error</h2>
            <p style={{ marginBottom: 16 }}>{this.state.errorMessage}</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' })
                window.location.reload()
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export type Home = {
  id: string
  name: string
  createdAt?: string
}

export type Member = {
  id: string
  homeId: string
  name: string
}

export type Share = {
  id: string
  billId: string
  memberId: string
  memberName?: string
  amountCents: number
  paidAt: string | null
}

export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  createdAt?: string
  shares: Share[]
}

export type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}

function formatCents(cents: number): string {
  const isNegative = cents < 0
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const rem = abs % 100
  const formatted = `$${dollars}.${rem.toString().padStart(2, '0')}`
  return isNegative ? `-${formatted}` : formatted
}

function formatDate(isoString?: string): string {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

function parseAmountInputToCents(val: string): number | null {
  const trimmed = val.trim()
  if (!trimmed) return null

  // If input contains decimal point (e.g. 12.50)
  if (trimmed.includes('.')) {
    const parts = trimmed.split('.')
    if (parts.length !== 2) return null
    const [wholeStr, decStr] = parts
    if (!wholeStr || !decStr || decStr.length > 2) return null
    const whole = Number.parseInt(wholeStr, 10)
    if (Number.isNaN(whole) || whole < 0) return null
    const paddedDec = decStr.padEnd(2, '0')
    const dec = Number.parseInt(paddedDec, 10)
    if (Number.isNaN(dec)) return null
    return whole * 100 + dec
  }

  // If input is already an integer (can be cents or dollar integer)
  const parsed = Number.parseInt(trimmed, 10)
  if (Number.isNaN(parsed) || parsed <= 0) return null
  return parsed
}

function AppRoot() {
  return (
    <ErrorBoundary>
      <BillSplitterPage />
    </ErrorBoundary>
  )
}

function BillSplitterPage() {
  const [homes, setHomes] = useState<Home[]>([])
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])

  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingHomeData, setLoadingHomeData] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Forms
  const [newHomeName, setNewHomeName] = useState('')
  const [creatingHome, setCreatingHome] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [newBillTitle, setNewBillTitle] = useState('')
  const [newBillAmount, setNewBillAmount] = useState('')
  const [creatingBill, setCreatingBill] = useState(false)

  // Action errors
  const [homeError, setHomeError] = useState<string | null>(null)
  const [memberError, setMemberError] = useState<string | null>(null)
  const [billError, setBillError] = useState<string | null>(null)
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({})
  const [payingShareIds, setPayingShareIds] = useState<Record<string, boolean>>({})

  // Fetch homes on load
  useEffect(() => {
    async function loadHomes() {
      setLoadingInitial(true)
      setGlobalError(null)
      try {
        const res = await fetch('/api/homes')
        if (!res.ok) {
          const errData = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(errData?.error || `Failed to fetch homes: ${res.status}`)
        }
        const data = (await res.json()) as { homes: Home[] }
        setHomes(data.homes || [])
        if (data.homes && data.homes.length > 0) {
          const firstHome = data.homes[0]
          if (firstHome) {
            setSelectedHomeId(firstHome.id)
          }
        }
      } catch (err) {
        setGlobalError(err instanceof Error ? err.message : 'Failed to connect to API')
      } finally {
        setLoadingInitial(false)
      }
    }

    loadHomes()
  }, [])

  // Fetch home details, members, bills, balances whenever selectedHomeId changes
  useEffect(() => {
    if (!selectedHomeId) {
      setMembers([])
      setBills([])
      setBalances([])
      return
    }

    let active = true

    async function loadHomeData() {
      setLoadingHomeData(true)
      setGlobalError(null)
      try {
        const [membersRes, billsRes, balancesRes] = await Promise.all([
          fetch(`/api/homes/${selectedHomeId}/members`),
          fetch(`/api/homes/${selectedHomeId}/bills`),
          fetch(`/api/homes/${selectedHomeId}/balances`),
        ])

        if (!active) return

        if (!membersRes.ok) {
          const err = (await membersRes.json().catch(() => null)) as { error?: string } | null
          throw new Error(err?.error || `Failed to fetch members: ${membersRes.status}`)
        }
        if (!billsRes.ok) {
          const err = (await billsRes.json().catch(() => null)) as { error?: string } | null
          throw new Error(err?.error || `Failed to fetch bills: ${billsRes.status}`)
        }
        if (!balancesRes.ok) {
          const err = (await balancesRes.json().catch(() => null)) as { error?: string } | null
          throw new Error(err?.error || `Failed to fetch balances: ${balancesRes.status}`)
        }

        const membersData = (await membersRes.json()) as { members: Member[] }
        const billsData = (await billsRes.json()) as { bills: Bill[] }
        const balancesData = (await balancesRes.json()) as { balances: Balance[] }

        if (!active) return
        setMembers(membersData.members || [])
        setBills(billsData.bills || [])
        setBalances(balancesData.balances || [])
      } catch (err) {
        if (!active) return
        setGlobalError(err instanceof Error ? err.message : 'Error loading home data')
      } finally {
        if (active) setLoadingHomeData(false)
      }
    }

    loadHomeData()

    return () => {
      active = false
    }
  }, [selectedHomeId])

  // Create Home
  async function handleCreateHome(e: React.FormEvent) {
    e.preventDefault()
    if (!newHomeName.trim()) return

    setCreatingHome(true)
    setHomeError(null)

    try {
      const res = await fetch('/api/homes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newHomeName.trim() }),
      })

      const data = (await res.json().catch(() => null)) as {
        id?: string
        name?: string
        error?: string
      } | null
      if (!res.ok) {
        throw new Error(data?.error || `Failed to create home (${res.status})`)
      }

      if (data?.id && data.name) {
        const created: Home = { id: data.id, name: data.name }
        setHomes((prev) => [created, ...prev])
        setSelectedHomeId(created.id)
        setNewHomeName('')
      }
    } catch (err) {
      setHomeError(err instanceof Error ? err.message : 'Error creating home')
    } finally {
      setCreatingHome(false)
    }
  }

  // Add Member
  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedHomeId || !newMemberName.trim()) return

    setAddingMember(true)
    setMemberError(null)

    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMemberName.trim() }),
      })

      const data = (await res.json().catch(() => null)) as {
        id?: string
        homeId?: string
        name?: string
        error?: string
      } | null
      if (!res.ok) {
        throw new Error(data?.error || `Failed to add member (${res.status})`)
      }

      if (data?.id && data.homeId && data.name) {
        const newMember: Member = { id: data.id, homeId: data.homeId, name: data.name }
        setMembers((prev) => [...prev, newMember])
        setNewMemberName('')

        // Refresh balances
        const balancesRes = await fetch(`/api/homes/${selectedHomeId}/balances`)
        if (balancesRes.ok) {
          const bData = (await balancesRes.json()) as { balances: Balance[] }
          setBalances(bData.balances)
        }
      }
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Error adding member')
    } finally {
      setAddingMember(false)
    }
  }

  // Create Bill
  async function handleCreateBill(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedHomeId) return

    setBillError(null)
    const cents = parseAmountInputToCents(newBillAmount)

    if (cents === null || cents <= 0) {
      setBillError('Amount must be a positive whole number of cents')
      return
    }

    if (!newBillTitle.trim()) {
      setBillError('Bill title is required')
      return
    }

    setCreatingBill(true)

    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newBillTitle.trim(), totalCents: cents }),
      })

      const data = (await res.json().catch(() => null)) as (Bill & { error?: string }) | null
      if (!res.ok) {
        throw new Error(data?.error || `Failed to create bill (${res.status})`)
      }

      if (data?.id && data.shares) {
        setBills((prev) => [data, ...prev])
        setNewBillTitle('')
        setNewBillAmount('')

        // Refresh balances
        const balancesRes = await fetch(`/api/homes/${selectedHomeId}/balances`)
        if (balancesRes.ok) {
          const bData = (await balancesRes.json()) as { balances: Balance[] }
          setBalances(bData.balances)
        }
      }
    } catch (err) {
      setBillError(err instanceof Error ? err.message : 'Error creating bill')
    } finally {
      setCreatingBill(false)
    }
  }

  // Pay Share
  async function handlePayShare(billId: string, shareId: string, customKey?: string) {
    setPaymentErrors((prev) => ({ ...prev, [shareId]: '' }))
    setPayingShareIds((prev) => ({ ...prev, [shareId]: true }))

    const idempotencyKey = customKey || crypto.randomUUID()

    try {
      const res = await fetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      })

      const data = (await res.json().catch(() => null)) as {
        id?: string
        memberId?: string
        amountCents?: number
        paidAt?: string
        error?: string
      } | null

      if (!res.ok) {
        // Keep share unpaid and display error
        throw new Error(data?.error || `Payment failed (${res.status})`)
      }

      if (data?.id && data.paidAt) {
        // Update share state locally
        setBills((prevBills) =>
          prevBills.map((b) => {
            if (b.id !== billId) return b
            return {
              ...b,
              shares: b.shares.map((s) =>
                s.id === shareId ? { ...s, paidAt: data.paidAt ?? null } : s,
              ),
            }
          }),
        )

        // Refresh balances
        if (selectedHomeId) {
          const balancesRes = await fetch(`/api/homes/${selectedHomeId}/balances`)
          if (balancesRes.ok) {
            const bData = (await balancesRes.json()) as { balances: Balance[] }
            setBalances(bData.balances)
          }
        }
      }
    } catch (err) {
      setPaymentErrors((prev) => ({
        ...prev,
        [shareId]: err instanceof Error ? err.message : 'Payment request failed',
      }))
    } finally {
      setPayingShareIds((prev) => ({ ...prev, [shareId]: false }))
    }
  }

  // Calculate live split preview
  const previewCents = parseAmountInputToCents(newBillAmount)
  const memberCount = members.length
  let splitPreviewText: string | null = null
  if (previewCents !== null && previewCents > 0 && memberCount > 0) {
    const baseShare = Math.floor(previewCents / memberCount)
    const remainder = previewCents % memberCount
    const previewList = members.slice(0, 3).map((m, idx) => {
      const share = baseShare + (idx < remainder ? 1 : 0)
      return `${m.name}: ${formatCents(share)}`
    })
    splitPreviewText = `Split preview: ${previewList.join(', ')}${memberCount > 3 ? ` ... and ${memberCount - 3} more` : ''}`
  }

  const selectedHome = homes.find((h) => h.id === selectedHomeId)

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div>
          <h1 className="brand-title">Shared Bill Splitter</h1>
          <p className="brand-subtitle">Cloudflare D1 + Workers + TanStack Router</p>
        </div>

        <div className="header-controls">
          {homes.length > 0 && (
            <select
              className="home-select"
              value={selectedHomeId || ''}
              onChange={(e) => setSelectedHomeId(e.target.value)}
            >
              {homes.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          )}

          <form onSubmit={handleCreateHome} style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="New home name..."
              className="form-input"
              style={{ width: 160 }}
              value={newHomeName}
              onChange={(e) => setNewHomeName(e.target.value)}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={creatingHome || !newHomeName.trim()}
            >
              {creatingHome ? 'Creating...' : 'Create'}
            </button>
          </form>
        </div>
      </header>

      {/* Global Alerts */}
      {globalError && (
        <div className="banner-alert banner-error">
          <span>{globalError}</span>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setGlobalError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {homeError && (
        <div className="banner-alert banner-error">
          <span>{homeError}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setHomeError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {loadingInitial ? (
        <div className="loading-indicator">
          <div className="spinner" />
          <span>Loading homes...</span>
        </div>
      ) : homes.length === 0 ? (
        <div className="empty-state">
          <h2 className="empty-state-title">No homes found</h2>
          <p className="empty-state-desc">
            Create your first shared home using the header input above to begin.
          </p>
        </div>
      ) : (
        <div className="grid-layout">
          {/* Left Column: Home Members, Balances, and Add Bill */}
          <div>
            {/* Balances & Housemates Card */}
            <div className="card">
              <div className="card-title">
                <span>{selectedHome?.name || 'Home'} Members</span>
                <span
                  className="tabular"
                  style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}
                >
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </span>
              </div>

              {loadingHomeData ? (
                <div className="loading-indicator" style={{ padding: '20px 0' }}>
                  <div className="spinner" />
                  <span>Loading members...</span>
                </div>
              ) : members.length === 0 ? (
                <div className="empty-state" style={{ padding: 20, marginBottom: 16 }}>
                  <p className="empty-state-title" style={{ fontSize: '0.9rem' }}>
                    No members in this home
                  </p>
                  <p className="empty-state-desc">Add members below before splitting bills.</p>
                </div>
              ) : (
                <ul className="members-list">
                  {balances.map((b, idx) => (
                    <li key={b.memberId} className="member-item">
                      <div>
                        <span className="member-name">{b.name}</span>
                        <span className="member-order">#{idx + 1}</span>
                      </div>
                      <span
                        className={`tabular member-balance ${b.outstandingCents === 0 ? 'settled' : ''}`}
                      >
                        {b.outstandingCents === 0 ? 'Settled' : formatCents(b.outstandingCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add Member Form */}
              <form onSubmit={handleAddMember}>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="New member name..."
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                  />
                </div>
                {memberError && (
                  <div className="share-error" style={{ marginBottom: 8 }}>
                    {memberError}
                  </div>
                )}
                <button
                  type="submit"
                  className="btn-secondary"
                  style={{ width: '100%' }}
                  disabled={addingMember || !newMemberName.trim()}
                >
                  {addingMember ? 'Adding...' : 'Add Member'}
                </button>
              </form>
            </div>

            {/* Create Bill Card */}
            <div className="card">
              <h2 className="card-title">Add New Bill</h2>
              <form onSubmit={handleCreateBill}>
                <div className="form-group">
                  <label htmlFor="bill-title-input" className="form-label">
                    Bill Title
                  </label>
                  <input
                    id="bill-title-input"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Electricity, Groceries, Internet"
                    value={newBillTitle}
                    onChange={(e) => setNewBillTitle(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="bill-amount-input" className="form-label">
                    Total Amount
                  </label>
                  <input
                    id="bill-amount-input"
                    type="text"
                    className="form-input tabular"
                    placeholder="e.g. 1000 (cents) or 10.00 (dollars)"
                    value={newBillAmount}
                    onChange={(e) => setNewBillAmount(e.target.value)}
                  />
                  {splitPreviewText && <div className="preview-split">{splitPreviewText}</div>}
                </div>

                {billError && (
                  <div className="share-error" style={{ marginBottom: 12 }}>
                    {billError}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: '100%' }}
                  disabled={creatingBill || !newBillTitle.trim() || !newBillAmount.trim()}
                >
                  {creatingBill ? 'Splitting Bill...' : 'Create & Split Bill'}
                </button>
              </form>
            </div>

            {/* Edge Cases & Resilience Test Panel */}
            <div className="test-scenarios-panel">
              <div className="test-scenarios-title">Verification & Stress Scenarios</div>
              <div className="test-scenarios-grid">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setBillError(null)
                    // Trigger invalid amount error
                    fetch(`/api/homes/${selectedHomeId}/bills`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ title: 'Invalid Test', totalCents: -50 }),
                    })
                      .then((r) => r.json() as Promise<{ error?: string }>)
                      .then((d) => setBillError(`Server rejected invalid amount: ${d.error}`))
                      .catch((e) => setBillError(String(e)))
                  }}
                >
                  Test Negative Amount (422)
                </button>

                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setGlobalError(null)
                    // Trigger 404 bill payment
                    fetch('/api/bills/non-existent-bill/shares/fake-share/pay', {
                      method: 'POST',
                      headers: { 'Idempotency-Key': crypto.randomUUID() },
                    })
                      .then((r) => r.json() as Promise<{ error?: string }>)
                      .then((d) => setGlobalError(`404 handled safely: ${d.error}`))
                      .catch((e) => setGlobalError(String(e)))
                  }}
                >
                  Test Nonexistent Bill (404)
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Bills Stream and Share Payments */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Bills & Shares</h2>
              <span className="tabular" style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                {bills.length} {bills.length === 1 ? 'bill' : 'bills'}
              </span>
            </div>

            {loadingHomeData ? (
              <div className="loading-indicator">
                <div className="spinner" />
                <span>Loading bills...</span>
              </div>
            ) : bills.length === 0 ? (
              <div className="empty-state">
                <h3 className="empty-state-title">No bills yet</h3>
                <p className="empty-state-desc">
                  Create a bill on the left to split expenses evenly across all members.
                </p>
              </div>
            ) : (
              bills.map((bill) => {
                const paidShares = bill.shares.filter((s) => s.paidAt !== null)
                const isAllPaid = paidShares.length === bill.shares.length

                return (
                  <div key={bill.id} className="bill-card">
                    <div className="bill-header">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <h3 className="bill-title">{bill.title}</h3>
                          {isAllPaid && (
                            <span className="status-badge badge-paid">Fully Settled</span>
                          )}
                        </div>
                        <div className="bill-meta">
                          {bill.createdAt ? formatDate(bill.createdAt) : ''}
                          {bill.createdAt ? ' • ' : ''}
                          {paidShares.length} of {bill.shares.length} shares paid
                        </div>
                      </div>
                      <div className="bill-total tabular">{formatCents(bill.totalCents)}</div>
                    </div>

                    <table className="shares-table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>Share Amount</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bill.shares.map((share) => {
                          const isPaid = share.paidAt !== null
                          const isPaying = payingShareIds[share.id] === true
                          const member = members.find((m) => m.id === share.memberId)
                          const displayName =
                            share.memberName || member?.name || share.memberId.slice(0, 8)
                          const shareErr = paymentErrors[share.id]

                          return (
                            <tr key={share.id}>
                              <td>
                                <strong>{displayName}</strong>
                              </td>
                              <td className="tabular">{formatCents(share.amountCents)}</td>
                              <td>
                                {isPaid ? (
                                  <span className="status-badge badge-paid">
                                    Paid {formatDate(share.paidAt ?? undefined)}
                                  </span>
                                ) : (
                                  <span className="status-badge badge-unpaid">Unpaid</span>
                                )}
                                {shareErr && <div className="share-error">{shareErr}</div>}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {!isPaid && (
                                  <button
                                    type="button"
                                    className="btn-primary btn-sm"
                                    disabled={isPaying}
                                    onClick={() => handlePayShare(bill.id, share.id)}
                                  >
                                    {isPaying ? 'Paying...' : 'Pay Share'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, DollarSign, Edit3, Package, Plus, RefreshCw, Save, ShieldAlert, Trash2, TrendingUp } from 'lucide-react'
import { supabase } from './lib/supabase'
import { formatPrice } from './lib/currency'
import { defaultProducts } from './lib/catalog'
import './Admin.css'

const emptyProduct = {
  name: '', slug: '', sku: '', category_id: '', product_type: '', short_description: '',
  description: '', regular_price: '', discount_price: '', stock_quantity: 0,
  is_featured: false, is_best_seller: false, is_new_arrival: true, is_active: true,
}
const statuses = [
  { value: 'pending', label: 'En attente' },
  { value: 'confirmed', label: 'Confirmée' },
  { value: 'preparing', label: 'En préparation' },
  { value: 'shipped', label: 'Expédiée' },
  { value: 'delivered', label: 'Livrée' },
  { value: 'cancelled', label: 'Annulée' },
]
const statusLabels = Object.fromEntries(statuses.map((status) => [status.value, status.label]))

export default function AdminDashboard({ session, onSignIn, onBack, onSignOut }) {
  const [authorized, setAuthorized] = useState(null)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [orders, setOrders] = useState([])
  const [form, setForm] = useState(emptyProduct)
  const [editingId, setEditingId] = useState(null)
  const [tab, setTab] = useState('products')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [setupRequired, setSetupRequired] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedOrderItems, setSelectedOrderItems] = useState([])

  const verifyAdmin = useCallback(async () => {
    if (!session?.user?.id) { setAuthorized(false); return false }
    const { data: role, error } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle()
    if (error?.code === 'PGRST205' || error?.code === '42P01') {
      setSetupRequired(true)
      setMessage('Supabase commerce tables are not installed yet. Run the migration in the SQL Editor.')
    }
    const allowed = !error && role?.role === 'admin'
    setAuthorized(allowed)
    return allowed
  }, [session])

  const loadData = useCallback(async () => {
    if (!(await verifyAdmin())) return
    setBusy(true)
    const [{ data: productRows, error: productError }, { data: categoryRows }, { data: orderRows, error: orderError }] = await Promise.all([
      supabase.from('products').select('*, categories(id, name)').order('created_at', { ascending: false }),
      supabase.from('categories').select('id, name').eq('is_active', true).order('display_order'),
      supabase.from('orders').select('id, order_number, customer_name, customer_email, total, order_status, payment_status, created_at').order('created_at', { ascending: false }),
    ])
    if (productError || orderError) setMessage('Could not load commerce data. Please try again.')
    let loadedProducts = productRows || []
    let loadedCategories = categoryRows || []
    if (!productError && loadedProducts.length === 0) {
      const categoryNames = [...new Set(defaultProducts.map((product) => product.category))]
      const { error: categoryInsertError } = await supabase.from('categories').upsert(
        categoryNames.map((name, index) => ({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), display_order: index, is_active: true })),
        { onConflict: 'slug' },
      )
      if (!categoryInsertError) {
        const { data: seededCategories } = await supabase.from('categories').select('id, name, slug').in('slug', categoryNames.map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')))
        loadedCategories = seededCategories || []
        const categoryByName = Object.fromEntries(loadedCategories.map((category) => [category.name, category.id]))
        const { error: seedError } = await supabase.from('products').insert(defaultProducts.map((product) => ({
          name: product.name,
          slug: product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          product_type: product.type,
          short_description: product.description,
          description: product.description,
          regular_price: product.price,
          stock_quantity: 10,
          category_id: categoryByName[product.category] || null,
          is_active: true,
          is_best_seller: product.tag === 'Bestseller',
          is_new_arrival: product.tag === 'New',
          is_featured: product.tag === 'Signature',
        })))
        if (!seedError) {
          const { data: refreshedProducts } = await supabase.from('products').select('*, categories(id, name)').order('created_at', { ascending: false })
          loadedProducts = refreshedProducts || []
          setMessage('Default catalog loaded. You can now edit stock, prices, and products.')
        } else setMessage(seedError.message)
      } else setMessage(categoryInsertError.message)
    }
    setProducts(loadedProducts)
    setCategories(loadedCategories)
    setOrders(orderRows || [])
    const orderId = new URLSearchParams(window.location.search).get('order')
    if (orderId) {
      const { data: detail } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle()
      if (detail) {
        const { data: items } = await supabase.from('order_items').select('*').eq('order_id', orderId).order('created_at')
        setSelectedOrder(detail)
        setSelectedOrderItems(items || [])
        setTab('orders')
      }
    }
    setBusy(false)
  }, [verifyAdmin])

  const updateStock = async (product, stock_quantity) => {
    const nextStock = Math.max(0, Number(stock_quantity) || 0)
    const { error } = await supabase.from('products').update({ stock_quantity: nextStock }).eq('id', product.id)
    if (error) setMessage(error.message)
    else setProducts((current) => current.map((item) => item.id === product.id ? { ...item, stock_quantity: nextStock } : item))
  }

  // Loading protected data is intentionally triggered when the verified session changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData() }, [loadData])

  const resetForm = () => { setForm(emptyProduct); setEditingId(null) }
  const editProduct = (product) => {
    setEditingId(product.id)
    setForm({ ...emptyProduct, ...product, category_id: product.category_id || '', discount_price: product.discount_price ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const saveProduct = async (event) => {
    event.preventDefault()
    setBusy(true); setMessage('')
    const payload = {
      name: form.name.trim(), slug: form.slug.trim() || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      sku: form.sku.trim() || null, category_id: form.category_id || null, product_type: form.product_type.trim() || null,
      short_description: form.short_description.trim() || null, description: form.description.trim(),
      regular_price: Number(form.regular_price), discount_price: form.discount_price === '' ? null : Number(form.discount_price),
      stock_quantity: Number(form.stock_quantity), is_featured: form.is_featured, is_best_seller: form.is_best_seller,
      is_new_arrival: form.is_new_arrival, is_active: form.is_active,
    }
    const result = editingId
      ? await supabase.from('products').update(payload).eq('id', editingId)
      : await supabase.from('products').insert(payload)
    if (result.error) setMessage(result.error.message)
    else { setMessage(editingId ? 'Product updated.' : 'Product created.'); resetForm(); await loadData() }
    setBusy(false)
  }
  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}"?`)) return
    setBusy(true)
    const { error } = await supabase.from('products').delete().eq('id', product.id)
    setMessage(error ? error.message : 'Product deleted.')
    await loadData(); setBusy(false)
  }
  const updateOrder = async (id, updates) => {
    const { error } = await supabase.from('orders').update(updates).eq('id', id)
    if (error) setMessage(error.message)
    else setOrders((current) => current.map((order) => order.id === id ? { ...order, ...updates } : order))
  }

  const stats = useMemo(() => ({
    products: products.length,
    active: products.filter((product) => product.is_active).length,
    orders: orders.length,
    pending: orders.filter((order) => ['pending', 'confirmed', 'preparing'].includes(order.order_status)).length,
    delivered: orders.filter((order) => order.order_status === 'delivered').length,
    revenue: orders.filter((order) => order.order_status !== 'cancelled').reduce((total, order) => total + Number(order.total || 0), 0),
    average: orders.length ? orders.filter((order) => order.order_status !== 'cancelled').reduce((total, order) => total + Number(order.total || 0), 0) / Math.max(1, orders.filter((order) => order.order_status !== 'cancelled').length) : 0,
  }), [products, orders])

  if (!session) return <section className="admin-gate"><ShieldAlert size={36} /><p className="eyebrow">Admin portal</p><h1>Sign in to continue.</h1><p>This area is restricted to Montana administrators.</p><button className="button button-dark" onClick={onSignIn}>SIGN IN <ArrowLeft size={15} /></button></section>
  if (authorized === null) return <section className="admin-gate"><RefreshCw className="spin" size={26} /><p>Checking administrator access…</p></section>
  if (!authorized) return <section className="admin-gate"><ShieldAlert size={36} /><p className="eyebrow">{setupRequired ? 'Setup required' : 'Access denied'}</p><h1>{setupRequired ? 'Finish Supabase setup.' : 'Admins only.'}</h1><p>{setupRequired ? 'Your login works, but the commerce database migration has not been applied to this Supabase project yet.' : 'Your account is signed in, but it does not have administrator access.'}</p>{setupRequired && <div className="admin-setup-note"><strong>Next step</strong><span>Open the Supabase SQL Editor and run <code>supabase/migrations/20261108010000_admin_commerce.sql</code>, then assign your user the admin role.</span></div>}<button className="button button-outline-dark" onClick={onBack}>RETURN TO SHOP</button><button className="admin-text-button" onClick={onSignOut}>Sign out</button></section>

  return <main className="admin-page">
    <div className="admin-topbar"><div><p className="eyebrow">Montana Cadeaux · Admin</p><h1>Commerce control room</h1></div><div className="admin-top-actions"><button className="button button-outline-dark" onClick={onBack}>VIEW SHOP</button><button className="admin-icon-button" onClick={loadData} aria-label="Refresh"><RefreshCw size={17} className={busy ? 'spin' : ''} /></button></div></div>
    <div className="admin-stats"><div><span>Chiffre d'affaires</span><strong>{formatPrice(stats.revenue)}</strong><small>{stats.delivered} livrée(s)</small></div><div><span>Commandes à traiter</span><strong>{stats.pending}</strong><small>{stats.orders} au total</small></div><div><span>Panier moyen</span><strong>{formatPrice(stats.average)}</strong><small>{stats.active} produits actifs</small></div></div>
    <div className="admin-tabs"><button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}><Package size={16} /> Produits <span>{products.length}</span></button><button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><CheckCircle2 size={16} /> Commandes <span>{orders.length}</span></button><button className={tab === 'finance' ? 'active' : ''} onClick={() => setTab('finance')}><TrendingUp size={16} /> Finance</button></div>
    {selectedOrder && <section className="admin-card admin-order-detail"><div className="admin-card-heading"><div><p className="eyebrow">Order detail</p><h2>{selectedOrder.order_number}</h2></div><button className="admin-text-button" onClick={() => { setSelectedOrder(null); window.history.replaceState({}, '', '/admin') }}>Close detail</button></div><div className="admin-detail-grid"><div><strong>Customer</strong><span>{selectedOrder.customer_name}</span><span>{selectedOrder.customer_email || 'Email not provided'}</span><span>{selectedOrder.customer_phone}</span></div><div><strong>Delivery</strong><span>{selectedOrder.city}</span><span>{selectedOrder.delivery_address}</span></div><div><strong>Payment</strong><span>{selectedOrder.payment_method} · {selectedOrder.payment_status}</span><span>{selectedOrder.order_status}</span></div><div><strong>Total</strong><span className="admin-detail-total">{formatPrice(selectedOrder.total)}</span></div></div><div className="admin-detail-items">{selectedOrderItems.map((item) => <div key={item.id}><img src={item.product_image || ''} alt="" /><span>{item.product_name} × {item.quantity}</span><strong>{formatPrice(item.subtotal)}</strong></div>)}</div></section>}
    {message && <div className="admin-message" role="status">{message}</div>}
    {tab === 'products' ? (<section className="admin-content">
      <form className="admin-card admin-product-form" onSubmit={saveProduct}>
        <div className="admin-card-heading"><div><p className="eyebrow">{editingId ? 'Edit listing' : 'New listing'}</p><h2>{editingId ? 'Update product' : 'Add a product'}</h2></div>{editingId && <button type="button" className="admin-text-button" onClick={resetForm}>Cancel edit</button>}</div>
        <div className="admin-form-grid"><label>NAME<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>SLUG<input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated if blank" /></label><label>SKU<input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></label><label>CATEGORY<select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="">Uncategorised</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>TYPE<input value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value })} /></label><label>REGULAR PRICE (DT)<input required type="number" min="0" step="0.01" value={form.regular_price} onChange={(e) => setForm({ ...form, regular_price: e.target.value })} /></label><label>DISCOUNT PRICE (DT)<input type="number" min="0" step="0.01" value={form.discount_price} onChange={(e) => setForm({ ...form, discount_price: e.target.value })} /></label><label>STOCK<input required type="number" min="0" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} /></label></div>
        <label>SHORT DESCRIPTION<input value={form.short_description || ''} onChange={(e) => setForm({ ...form, short_description: e.target.value })} /></label><label>DESCRIPTION<textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="admin-checks">{[['is_active', 'Published'], ['is_featured', 'Featured'], ['is_best_seller', 'Bestseller'], ['is_new_arrival', 'New arrival']].map(([key, label]) => <label key={key}><input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />{label}</label>)}</div>
        <button className="button button-dark" disabled={busy}>{editingId ? <Save size={15} /> : <Plus size={15} />}{editingId ? 'SAVE CHANGES' : 'CREATE PRODUCT'}</button>
      </form>
      <div className="admin-card"><div className="admin-card-heading"><div><p className="eyebrow">Catalog</p><h2>Products</h2></div><span className="admin-count">{products.length} total</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th /></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku || product.slug}</small></td><td>{product.categories?.name || '—'}</td><td>{formatPrice(product.discount_price ?? product.regular_price)}</td><td><input className="stock-input" type="number" min="0" defaultValue={product.stock_quantity} onBlur={(event) => updateStock(product, event.target.value)} aria-label={`Stock for ${product.name}`} /></td><td><span className={`status-pill ${product.is_active ? 'status-active' : 'status-muted'}`}>{product.is_active ? 'Active' : 'Draft'}</span></td><td className="admin-row-actions"><button onClick={() => editProduct(product)} aria-label={`Edit ${product.name}`}><Edit3 size={15} /></button><button onClick={() => deleteProduct(product)} aria-label={`Delete ${product.name}`}><Trash2 size={15} /></button></td></tr>)}</tbody></table>{products.length === 0 && <p className="admin-empty">No products yet. Create your first listing above.</p>}</div></div>
    </section>) : tab === 'orders' ? (<section className="admin-card"><div className="admin-card-heading"><div><p className="eyebrow">Suivi des commandes</p><h2>Commandes</h2></div><span className="admin-count">{stats.pending} à traiter</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Commande</th><th>Client</th><th>Total</th><th>Paiement</th><th>État livraison</th><th>Date</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.order_number}</strong><small>{order.customer_email || 'Sans email'}</small></td><td><strong>{order.customer_name}</strong><small>{order.customer_phone || 'Téléphone non renseigné'}</small></td><td><strong>{formatPrice(order.total)}</strong></td><td><button className={`status-pill ${order.payment_status === 'paid' ? 'status-active' : 'status-muted'}`} onClick={() => updateOrder(order.id, { payment_status: order.payment_status === 'paid' ? 'pending' : 'paid' })}>{order.payment_status === 'paid' ? 'Payée' : 'COD · À encaisser'}</button></td><td><select className={`status-select status-${order.order_status}`} value={order.order_status} onChange={(e) => updateOrder(order.id, { order_status: e.target.value })}>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select><small className="order-status-help">{statusLabels[order.order_status]}</small></td><td>{new Date(order.created_at).toLocaleDateString('fr-FR')}</td></tr>)}</tbody></table>{orders.length === 0 && <p className="admin-empty">Aucune commande pour le moment.</p>}</div></section>) : (<section className="finance-grid"><div className="admin-card finance-hero"><p className="eyebrow">Pilotage financier</p><h2>La performance de votre boutique.</h2><p>Suivez le chiffre d'affaires confirmé, les commandes livrées et le panier moyen en temps réel.</p><div className="finance-total"><DollarSign size={20} /><strong>{formatPrice(stats.revenue)}</strong><span>revenus hors commandes annulées</span></div></div><div className="finance-metrics"><div className="admin-card"><TrendingUp size={20} /><span>Chiffre d'affaires</span><strong>{formatPrice(stats.revenue)}</strong></div><div className="admin-card"><CheckCircle2 size={20} /><span>Commandes livrées</span><strong>{stats.delivered}</strong></div><div className="admin-card"><Clock3 size={20} /><span>En attente</span><strong>{stats.pending}</strong></div><div className="admin-card"><DollarSign size={20} /><span>Panier moyen</span><strong>{formatPrice(stats.average)}</strong></div></div><div className="admin-card finance-breakdown"><div className="admin-card-heading"><div><p className="eyebrow">Répartition</p><h2>État des commandes</h2></div></div>{statuses.map((status) => <div className="finance-row" key={status.value}><span><i className={`status-dot status-${status.value}`} />{status.label}</span><strong>{orders.filter((order) => order.order_status === status.value).length}</strong></div>)}</div></section>)}
  </main>
}

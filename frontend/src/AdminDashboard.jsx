import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, DollarSign, Edit3, Filter, Package, Phone, Plus, RefreshCw, Save, Search, ShieldAlert, Trash2, TrendingUp, UserRound, Users, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { formatPrice } from './lib/currency'
import './Admin.css'

const emptyProduct = {
  name: '', slug: '', sku: '', category_id: '', product_type: '', short_description: '',
  description: '', regular_price: '', discount_price: '', stock_quantity: 0,
  is_featured: false, is_best_seller: false, is_new_arrival: true, is_active: true,
}
const emptyColor = { name: '', hex_code: '#C6A15B', stock_quantity: 0 }
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
  const [customers, setCustomers] = useState([])
  const [form, setForm] = useState(emptyProduct)
  const [editingId, setEditingId] = useState(null)
  const [tab, setTab] = useState('products')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [setupRequired, setSetupRequired] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedOrderItems, setSelectedOrderItems] = useState([])
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [colors, setColors] = useState([])
  const [orderQuery, setOrderQuery] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')

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
    const [{ data: productRows, error: productError }, { data: categoryRows, error: categoryError }, { data: orderRows, error: orderError }, { data: customerRows, error: customerError }] = await Promise.all([
      supabase.from('products').select('*, categories(id, name)').order('created_at', { ascending: false }),
      supabase.from('categories').select('id, name').eq('is_active', true).order('display_order'),
      supabase.from('orders').select('id, order_number, customer_name, customer_email, total, order_status, payment_status, created_at').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, phone, created_at').order('created_at', { ascending: false }),
    ])
    if (productError || categoryError || orderError || customerError) setMessage('Could not load all commerce data. Check your Supabase policies and try again.')
    let loadedProducts = productRows || []
    let loadedCategories = categoryRows || []
    setProducts(loadedProducts)
    setCategories(loadedCategories)
    setOrders(orderRows || [])
    setCustomers(customerRows || [])
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
    const parsedStock = Number(stock_quantity)
    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      setMessage('Stock must be a whole number greater than or equal to zero.')
      return
    }
    const nextStock = parsedStock
    const { error } = await supabase.from('products').update({ stock_quantity: nextStock }).eq('id', product.id)
    if (error) setMessage(error.message)
    else setProducts((current) => current.map((item) => item.id === product.id ? { ...item, stock_quantity: nextStock } : item))
  }

  useEffect(() => {
    // Loading protected data is intentionally triggered when the verified session changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
    const channel = supabase.channel('admin-commerce-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadData])

  const resetForm = () => { setForm(emptyProduct); setEditingId(null); setImageFile(null); setImagePreview(''); setColors([]) }
  const editProduct = async (product) => {
    setEditingId(product.id)
    setForm({ ...emptyProduct, ...product, category_id: product.category_id || '', discount_price: product.discount_price ?? '' })
    setImageFile(null)
    const [{ data: image }, { data: productColors }] = await Promise.all([
      supabase.from('product_images').select('image_url').eq('product_id', product.id).order('display_order').limit(1).maybeSingle(),
      supabase.from('product_colors').select('id, name, hex_code, stock_quantity').eq('product_id', product.id).order('created_at'),
    ])
    setImagePreview(image?.image_url || '')
    setColors((productColors || []).map(({ id, name, hex_code, stock_quantity }) => ({ id, name, hex_code, stock_quantity })))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const handleImageChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setMessage('Please choose an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { setMessage('Images must be smaller than 5 MB.'); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }
  const addColor = () => setColors((current) => [...current, { ...emptyColor }])
  const updateColor = (index, key, value) => setColors((current) => current.map((color, colorIndex) => colorIndex === index ? { ...color, [key]: value } : color))
  const removeColor = (index) => setColors((current) => current.filter((_, colorIndex) => colorIndex !== index))
  const saveProduct = async (event) => {
    event.preventDefault()
    setBusy(true); setMessage('')
    const regularPrice = Number(form.regular_price)
    const discountPrice = form.discount_price === '' ? null : Number(form.discount_price)
    const stockQuantity = Number(form.stock_quantity)
    if (!form.name.trim() || !Number.isFinite(regularPrice) || regularPrice < 0 || (discountPrice !== null && (!Number.isFinite(discountPrice) || discountPrice < 0 || discountPrice > regularPrice)) || !Number.isInteger(stockQuantity) || stockQuantity < 0) {
      setMessage('Please enter a valid product name, price, discount, and whole-number stock quantity.')
      setBusy(false)
      return
    }
    const payload = {
      name: form.name.trim(), slug: form.slug.trim() || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      sku: form.sku.trim() || null, category_id: form.category_id || null, product_type: form.product_type.trim() || null,
      short_description: form.short_description.trim() || null, description: form.description.trim(),
      regular_price: regularPrice, discount_price: discountPrice,
      stock_quantity: stockQuantity, is_featured: form.is_featured, is_best_seller: form.is_best_seller,
      is_new_arrival: form.is_new_arrival, is_active: form.is_active,
    }
    const result = editingId
      ? await supabase.from('products').update(payload).eq('id', editingId).select('id').single()
      : await supabase.from('products').insert(payload).select('id').single()
    if (result.error) setMessage(result.error.message)
    else {
      const productId = editingId || result.data?.id
      if (!productId) { setMessage('Product saved, but its ID could not be read.'); setBusy(false); return }
      if (imageFile) {
        if (editingId) {
          const { error: deleteImageError } = await supabase.from('product_images').delete().eq('product_id', productId)
          if (deleteImageError) {
            setMessage(`Product saved, but the previous image could not be replaced: ${deleteImageError.message}`)
            setBusy(false)
            return
          }
        }
        const extension = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `${productId}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from('product-images').upload(path, imageFile, { upsert: false, contentType: imageFile.type })
        if (uploadError) { setMessage(`Product saved, but image upload failed: ${uploadError.message}`); setBusy(false); return }
        const { data: publicUrl } = supabase.storage.from('product-images').getPublicUrl(path)
        if (!publicUrl?.publicUrl) {
          setMessage('Product saved, but the image URL could not be generated.')
          setBusy(false)
          return
        }
        const { data: imageRow, error: imageError } = await supabase.from('product_images').insert({
          product_id: productId,
          storage_path: path,
          image_url: publicUrl.publicUrl,
          alt_text: form.name.trim(),
          display_order: 0,
        }).select('id, image_url').single()
        if (imageError) { setMessage(`Product saved, but image record failed: ${imageError.message}`); setBusy(false); return }
        if (!imageRow?.image_url) {
          setMessage('Product saved, but the image record was not returned by Supabase.')
          setBusy(false)
          return
        }
      }
      if (editingId) {
        const { error: deleteColorsError } = await supabase.from('product_colors').delete().eq('product_id', productId)
        if (deleteColorsError) {
          setMessage(`Product saved, but existing colors could not be replaced: ${deleteColorsError.message}`)
          setBusy(false)
          return
        }
      }
      const validColors = colors.filter((color) => color.name.trim() && /^#[0-9A-Fa-f]{6}$/.test(color.hex_code))
      if (validColors.length) {
        const { error: colorsError } = await supabase.from('product_colors').insert(validColors.map((color) => ({ product_id: productId, name: color.name.trim(), hex_code: color.hex_code, stock_quantity: Math.max(0, Number(color.stock_quantity) || 0), is_active: true })))
        if (colorsError) { setMessage(`Product saved, but colors could not be saved: ${colorsError.message}`); setBusy(false); return }
      }
      setMessage(editingId ? 'Product updated with image and available colors.' : 'Product created with image and available colors.')
      resetForm(); await loadData()
    }
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
    confirmed: orders.filter((order) => order.order_status === 'confirmed').length,
    cancelled: orders.filter((order) => order.order_status === 'cancelled').length,
    lowStock: products.filter((product) => product.is_active && Number(product.stock_quantity) > 0 && Number(product.stock_quantity) <= 5).length,
    outOfStock: products.filter((product) => product.is_active && Number(product.stock_quantity) === 0).length,
  }), [products, orders])

  const visibleOrders = useMemo(() => orders.filter((order) => {
    const query = orderQuery.trim().toLowerCase()
    const matchesQuery = !query || `${order.order_number} ${order.customer_name} ${order.customer_email || ''}`.toLowerCase().includes(query)
    return matchesQuery && (orderStatusFilter === 'all' || order.order_status === orderStatusFilter)
  }), [orderQuery, orderStatusFilter, orders])

  if (!session) return <section className="admin-gate"><ShieldAlert size={36} /><p className="eyebrow">Admin portal</p><h1>Sign in to continue.</h1><p>This area is restricted to Montana administrators.</p><button className="button button-dark" onClick={onSignIn}>SIGN IN <ArrowLeft size={15} /></button></section>
  if (authorized === null) return <section className="admin-gate"><RefreshCw className="spin" size={26} /><p>Checking administrator access…</p></section>
  if (!authorized) return <section className="admin-gate"><ShieldAlert size={36} /><p className="eyebrow">{setupRequired ? 'Setup required' : 'Access denied'}</p><h1>{setupRequired ? 'Finish Supabase setup.' : 'Admins only.'}</h1><p>{setupRequired ? 'Your login works, but the commerce database migration has not been applied to this Supabase project yet.' : 'Your account is signed in, but it does not have administrator access.'}</p>{setupRequired && <div className="admin-setup-note"><strong>Next step</strong><span>Open the Supabase SQL Editor and run <code>supabase/migrations/20261108010000_admin_commerce.sql</code>, then assign your user the admin role.</span></div>}<button className="button button-outline-dark" onClick={onBack}>RETURN TO SHOP</button><button className="admin-text-button" onClick={onSignOut}>Sign out</button></section>

  return <main className="admin-page">
    <div className="admin-topbar"><div><p className="eyebrow">Montana Cadeaux · Admin</p><h1>Commerce control room</h1></div><div className="admin-top-actions"><button className="button button-outline-dark" onClick={onBack}>VIEW SHOP</button><button className="admin-icon-button" onClick={loadData} aria-label="Refresh"><RefreshCw size={17} className={busy ? 'spin' : ''} /></button></div></div>
    <div className="admin-stats"><div><span>Chiffre d'affaires</span><strong>{formatPrice(stats.revenue)}</strong><small>{stats.delivered} livrée(s)</small></div><div><span>Commandes à traiter</span><strong>{stats.pending}</strong><small>{stats.confirmed} confirmée(s) · {stats.cancelled} annulée(s)</small></div><div><span>Clients</span><strong>{customers.length}</strong><small>{stats.orders} commande(s) · panier moyen {formatPrice(stats.average)}</small></div><div><span>Produits actifs</span><strong>{stats.active}</strong><small>{stats.lowStock} stock faible · {stats.outOfStock} épuisé(s)</small></div></div>
    <div className="admin-tabs"><button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}><Package size={16} /> Produits <span>{products.length}</span></button><button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><CheckCircle2 size={16} /> Commandes <span>{orders.length}</span></button><button className={tab === 'customers' ? 'active' : ''} onClick={() => setTab('customers')}><Users size={16} /> Clients <span>{customers.length}</span></button><button className={tab === 'finance' ? 'active' : ''} onClick={() => setTab('finance')}><TrendingUp size={16} /> Finance</button></div>
    {selectedOrder && <section className="admin-card admin-order-detail"><div className="admin-card-heading"><div><p className="eyebrow">Order detail</p><h2>{selectedOrder.order_number}</h2></div><button className="admin-text-button" onClick={() => { setSelectedOrder(null); window.history.replaceState({}, '', '/admin') }}>Close detail</button></div><div className="admin-detail-grid"><div><strong>Customer</strong><span>{selectedOrder.customer_name}</span><span>{selectedOrder.customer_email || 'Email not provided'}</span><span>{selectedOrder.customer_phone}</span></div><div><strong>Delivery</strong><span>{selectedOrder.city}</span><span>{selectedOrder.delivery_address}</span></div><div><strong>Payment</strong><span>{selectedOrder.payment_method} · {selectedOrder.payment_status}</span><span>{selectedOrder.order_status}</span></div><div><strong>Total</strong><span className="admin-detail-total">{formatPrice(selectedOrder.total)}</span></div></div><div className="admin-detail-items">{selectedOrderItems.map((item) => <div key={item.id}><img src={item.product_image || ''} alt="" /><span>{item.product_name} × {item.quantity}</span><strong>{formatPrice(item.subtotal)}</strong></div>)}</div></section>}
    {message && <div className="admin-message" role="status">{message}</div>}
    {tab === 'products' ? (<section className="admin-content">
      <form className="admin-card admin-product-form" onSubmit={saveProduct}>
        <div className="admin-card-heading"><div><p className="eyebrow">{editingId ? 'Edit listing' : 'New listing'}</p><h2>{editingId ? 'Update product' : 'Add a product'}</h2></div>{editingId && <button type="button" className="admin-text-button" onClick={resetForm}>Cancel edit</button>}</div>
        <div className="admin-form-grid"><label>NAME<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>SLUG<input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated if blank" /></label><label>SKU<input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></label><label>CATEGORY<select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="">Uncategorised</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>TYPE<input value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value })} /></label><label>REGULAR PRICE (DT)<input required type="number" min="0" step="0.01" value={form.regular_price} onChange={(e) => setForm({ ...form, regular_price: e.target.value })} /></label><label>DISCOUNT PRICE (DT)<input type="number" min="0" step="0.01" value={form.discount_price} onChange={(e) => setForm({ ...form, discount_price: e.target.value })} /></label><label>STOCK<input required type="number" min="0" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} /></label></div>
        <label>SHORT DESCRIPTION<input value={form.short_description || ''} onChange={(e) => setForm({ ...form, short_description: e.target.value })} /></label><label>DESCRIPTION<textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="admin-media-field"><label>PRODUCT IMAGE<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageChange} /></label>{imagePreview && <div className="admin-image-preview"><img src={imagePreview} alt="Product preview" /><button type="button" onClick={() => { setImageFile(null); setImagePreview('') }} aria-label="Remove product image"><X size={15} /></button></div>}<small>PNG, JPG or WebP · maximum 5 MB</small></div>
        <div className="admin-colors-field"><div className="admin-inline-heading"><div><p className="eyebrow">Available options</p><h3>Product colors</h3></div><button type="button" className="admin-add-option" onClick={addColor}><Plus size={14} /> ADD COLOR</button></div>{colors.length === 0 && <p className="admin-field-help">Add the colors customers can choose from, with stock for each option.</p>}{colors.map((color, index) => <div className="admin-color-row" key={`${color.id || 'new'}-${index}`}><input value={color.name} onChange={(e) => updateColor(index, 'name', e.target.value)} placeholder="Color name · Gold" aria-label="Color name" /><input type="color" value={color.hex_code} onChange={(e) => updateColor(index, 'hex_code', e.target.value)} aria-label="Color swatch" /><input type="number" min="0" value={color.stock_quantity} onChange={(e) => updateColor(index, 'stock_quantity', e.target.value)} placeholder="Stock" aria-label="Color stock" /><button type="button" onClick={() => removeColor(index)} aria-label="Remove color"><X size={15} /></button></div>)}</div>
        <div className="admin-checks">{[['is_active', 'Published'], ['is_featured', 'Featured'], ['is_best_seller', 'Bestseller'], ['is_new_arrival', 'New arrival']].map(([key, label]) => <label key={key}><input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />{label}</label>)}</div>
        <button className="button button-dark" disabled={busy}>{editingId ? <Save size={15} /> : <Plus size={15} />}{editingId ? 'SAVE CHANGES' : 'CREATE PRODUCT'}</button>
      </form>
      <div className="admin-card"><div className="admin-card-heading"><div><p className="eyebrow">Catalog</p><h2>Products</h2></div><span className="admin-count">{products.length} total</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th /></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku || product.slug}</small></td><td>{product.categories?.name || '—'}</td><td>{formatPrice(product.discount_price ?? product.regular_price)}</td><td><input className="stock-input" type="number" min="0" defaultValue={product.stock_quantity} onBlur={(event) => updateStock(product, event.target.value)} aria-label={`Stock for ${product.name}`} /></td><td><span className={`status-pill ${product.is_active ? 'status-active' : 'status-muted'}`}>{product.is_active ? 'Active' : 'Draft'}</span></td><td className="admin-row-actions"><button onClick={() => editProduct(product)} aria-label={`Edit ${product.name}`}><Edit3 size={15} /></button><button onClick={() => deleteProduct(product)} aria-label={`Delete ${product.name}`}><Trash2 size={15} /></button></td></tr>)}</tbody></table>{products.length === 0 && <p className="admin-empty">No products yet. Create your first listing above.</p>}</div></div>
    </section>) : tab === 'orders' ? (<section className="admin-card"><div className="admin-card-heading"><div><p className="eyebrow">Suivi des commandes</p><h2>Commandes</h2></div><span className="admin-count">{stats.pending} à traiter</span></div><div className="admin-toolbar"><label className="admin-search"><Search size={15} /><input value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder="Rechercher une commande ou un client" /></label><label className="admin-filter"><Filter size={15} /><select value={orderStatusFilter} onChange={(event) => setOrderStatusFilter(event.target.value)}><option value="all">Tous les statuts</option>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Commande</th><th>Client</th><th>Total</th><th>Paiement</th><th>État livraison</th><th>Date</th><th /></tr></thead><tbody>{visibleOrders.map((order) => <tr key={order.id}><td><button className="admin-link-button" onClick={() => { setSelectedOrder(order); setTab('orders') }}><strong>{order.order_number}</strong></button><small>{order.customer_email || 'Sans email'}</small></td><td><strong>{order.customer_name}</strong><small>{order.customer_phone || 'Téléphone non renseigné'}</small></td><td><strong>{formatPrice(order.total)}</strong></td><td><button className={`status-pill ${order.payment_status === 'paid' ? 'status-active' : 'status-muted'}`} onClick={() => updateOrder(order.id, { payment_status: order.payment_status === 'paid' ? 'pending' : 'paid' })}>{order.payment_status === 'paid' ? 'Payée' : 'COD · À encaisser'}</button></td><td><select className={`status-select status-${order.order_status}`} value={order.order_status} onChange={(e) => updateOrder(order.id, { order_status: e.target.value })}>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select><small className="order-status-help">{statusLabels[order.order_status]}</small></td><td>{new Date(order.created_at).toLocaleDateString('fr-FR')}</td><td><a className="admin-phone-link" href={`tel:${order.customer_phone || ''}`} aria-label={`Call ${order.customer_name}`}><Phone size={14} /></a></td></tr>)}</tbody></table>{visibleOrders.length === 0 && <p className="admin-empty">Aucune commande ne correspond à ces critères.</p>}</div></section>) : tab === 'customers' ? (<section className="admin-card"><div className="admin-card-heading"><div><p className="eyebrow">Customer directory</p><h2>Clients</h2></div><span className="admin-count">{customers.length} total</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Client</th><th>Email</th><th>Téléphone</th><th>Inscription</th><th /></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong><UserRound size={14} /> {customer.full_name || 'Sans nom'}</strong></td><td>{customer.email || '—'}</td><td>{customer.phone ? <a className="admin-phone-link" href={`tel:${customer.phone}`}>{customer.phone}</a> : '—'}</td><td>{new Date(customer.created_at).toLocaleDateString('fr-FR')}</td><td><a className="admin-phone-link" href={`mailto:${customer.email || ''}`} aria-label={`Email ${customer.full_name}`}><Search size={14} /></a></td></tr>)}</tbody></table>{customers.length === 0 && <p className="admin-empty">Aucun client enregistré.</p>}</div></section>) : (<section className="finance-grid"><div className="admin-card finance-hero"><p className="eyebrow">Pilotage financier</p><h2>La performance de votre boutique.</h2><p>Suivez le chiffre d'affaires confirmé, les commandes livrées et le panier moyen en temps réel.</p><div className="finance-total"><DollarSign size={20} /><strong>{formatPrice(stats.revenue)}</strong><span>revenus hors commandes annulées</span></div></div><div className="finance-metrics"><div className="admin-card"><TrendingUp size={20} /><span>Chiffre d'affaires</span><strong>{formatPrice(stats.revenue)}</strong></div><div className="admin-card"><CheckCircle2 size={20} /><span>Commandes livrées</span><strong>{stats.delivered}</strong></div><div className="admin-card"><Clock3 size={20} /><span>En attente</span><strong>{stats.pending}</strong></div><div className="admin-card"><DollarSign size={20} /><span>Panier moyen</span><strong>{formatPrice(stats.average)}</strong></div></div><div className="admin-card finance-breakdown"><div className="admin-card-heading"><div><p className="eyebrow">Répartition</p><h2>État des commandes</h2></div></div>{statuses.map((status) => <div className="finance-row" key={status.value}><span><i className={`status-dot status-${status.value}`} />{status.label}</span><strong>{orders.filter((order) => order.order_status === status.value).length}</strong></div>)}</div></section>)}
  </main>
}

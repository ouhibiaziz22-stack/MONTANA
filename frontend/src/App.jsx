import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight, Check, ChevronDown, ChevronLeft, Heart, LayoutDashboard, Menu,
  Minus, Plus, Search, ShoppingBag, Sparkles, Truck, User, X,
} from 'lucide-react'
import './App.css'
import './Premium.css'
import { calculateOrderTotal, DELIVERY_FEE, formatPrice } from './lib/currency'
import { supabase } from './lib/supabase'
import AdminDashboard from './AdminDashboard'

const Motion = motion
const collections = [
  { name: 'For Women', kicker: 'The feminine edit', image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1200&q=85', copy: 'Quietly confident pieces for every chapter.' },
  { name: 'For Men', kicker: 'The considered edit', image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=85', copy: 'Modern essentials, made to be lived in.' },
  { name: 'Pack 3 en 1', kicker: 'The gifting edit', image: 'https://images.unsplash.com/photo-1547887538-e3a2f32cb1cc?auto=format&fit=crop&w=1200&q=85', copy: 'Three beautiful reasons to celebrate.' },
]

function App() {
  const [activeView, setActiveView] = useState(() => window.location.pathname === '/admin' ? 'admin' : 'home')
  const [activeCategory, setActiveCategory] = useState('All')
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem('montana-cart') || '[]') } catch { return [] }
  })
  const [cartOpen, setCartOpen] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [checkout, setCheckout] = useState(false)
  const [orderComplete, setOrderComplete] = useState(false)
  const [toast, setToast] = useState('')
  const [email, setEmail] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [products, setProducts] = useState([])
  const [lastOrderNumber, setLastOrderNumber] = useState('')

  useEffect(() => localStorage.setItem('montana-cart', JSON.stringify(cart)), [cart])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const updateHeader = () => setScrolled(window.scrollY > 24)
    updateHeader()
    window.addEventListener('scroll', updateHeader, { passive: true })
    return () => window.removeEventListener('scroll', updateHeader)
  }, [])
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) setIsAdmin(false)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])
  useEffect(() => {
    let active = true
    if (!session?.user?.id) return undefined
    Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle(),
    ]).then(([roleResult, profileResult]) => {
      if (!active) return
      setIsAdmin(!roleResult.error && roleResult.data?.role === 'admin')
      setProfileName(profileResult.data?.full_name || session.user.user_metadata?.full_name || '')
    })
    return () => { active = false }
  }, [session])
  useEffect(() => {
    let active = true
    const loadCatalog = async () => {
      const [{ data: rows, error }] = await Promise.all([
        supabase.from('products').select('*, categories(name), product_images(image_url, display_order), product_colors(name)').eq('is_active', true).order('created_at', { ascending: false }),
      ])
      if (!active || error) return
      setProducts((rows || []).map((product) => ({
        ...product,
        category: product.categories?.name || 'All',
        type: product.product_type || 'Accessories',
        price: Number(product.discount_price ?? product.regular_price),
        image: product.product_images?.sort((a, b) => a.display_order - b.display_order)[0]?.image_url || '/montana-logo.png',
        description: product.description || product.short_description || '',
        colors: (product.product_colors || []).map((color) => color.name),
        tag: product.is_best_seller ? 'Bestseller' : product.is_new_arrival ? 'New' : product.is_featured ? 'Signature' : '',
      })))
    }
    loadCatalog()
    const channel = supabase.channel('storefront-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, loadCatalog)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, loadCatalog)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_colors' }, loadCatalog)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [])

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0)
  const cartTotal = cart.reduce((total, item) => total + item.price * item.quantity, 0)
  const accountName = profileName || session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || ''
  const accountInitials = accountName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'MC'

  const navigate = (view, category = 'All') => {
    setActiveView(view)
    setActiveCategory(category)
    setMobileMenu(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.history.pushState({}, '', view === 'admin' ? '/admin' : '/')
  }

  const handleSearchChange = (value) => {
    setSearch(value)
    if (value.trim() && activeView !== 'collection') {
      setActiveView('collection')
      setActiveCategory('All')
      window.history.pushState({}, '', '/')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const clearSearch = () => {
    setSearch('')
    setSearchOpen(false)
    setActiveView('home')
    setActiveCategory('All')
    window.history.pushState({}, '', '/')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const addToCart = (product) => {
    setCart((current) => {
      const found = current.find((item) => item.id === product.id)
      const nextQuantity = (found?.quantity || 0) + 1
      if (nextQuantity > Number(product.stock_quantity || 0)) {
        setToast(product.stock_quantity ? `Only ${product.stock_quantity} available` : 'Out of Stock')
        return current
      }
      return found ? current.map((item) => item.id === product.id ? { ...item, quantity: nextQuantity } : item) : [...current, { ...product, quantity: 1 }]
    })
    setToast(`${product.name} added to your bag`)
    setCartOpen(true)
  }

  const updateQuantity = (id, delta) => setCart((current) => current.map((item) => {
    if (item.id !== id) return item
    const quantity = Math.max(0, Math.min(Number(item.stock_quantity || 0), item.quantity + delta))
    if (delta > 0 && quantity === item.quantity) setToast(item.stock_quantity ? `Only ${item.stock_quantity} available` : 'Out of Stock')
    return { ...item, quantity }
  }).filter((item) => item.quantity > 0))

  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = activeCategory === 'All' || product.category === activeCategory
    const query = search.trim().toLowerCase()
    const searchableText = `${product.name} ${product.type} ${product.category} ${product.description} ${product.sku || ''} ${(product.colors || []).join(' ')}`.toLowerCase()
    return matchesCategory && (!query || searchableText.includes(query))
  }), [activeCategory, products, search])

  const submitNewsletter = (event) => {
    event.preventDefault()
    if (email) { setToast('Welcome to the Montana circle'); setEmail('') }
  }

  const placeOrder = async (form) => {
    const { data: order, error: orderError } = await supabase.rpc('place_order', {
      p_customer_name: form.name.trim(), p_customer_email: (form.email || session?.user?.email || '').trim(),
      p_customer_phone: form.phone.trim(), p_governorate: form.governorate.trim(),
      p_city: form.city.trim(), p_delivery_address: form.address.trim(),
      p_notes: form.notes.trim(), p_items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity, product_image: item.image })),
    })
    if (orderError) {
      const missingCheckoutRpc = orderError.code === 'PGRST202' || orderError.message.includes('Could not find the function public.place_order')
      setToast(missingCheckoutRpc
        ? 'Checkout is not enabled yet. Apply the latest Supabase migration, then try again.'
        : orderError.message.includes('AUTH_REQUIRED') ? 'Guest checkout is not enabled in Supabase. Apply migration 20261110070000_guest_checkout.sql, then try again.'
        : orderError.message.includes('email_notification_token') ? 'Checkout database is outdated. Apply migration 20261110060000_checkout_without_email_token.sql in Supabase, then try again.'
        : orderError.message.includes('INVALID_DELIVERY_DETAILS') ? 'Please enter a valid name, phone number, city, and complete delivery address.'
        : orderError.message.includes('INSUFFICIENT_STOCK') ? 'Some items are no longer available in that quantity.' : `Order could not be saved: ${orderError.message}`)
      return false
    }
    setCart([])
    setCheckout(false)
    setLastOrderNumber(order.order_number)
    setOrderComplete(true)
    return true
  }

  return (
    <div className="app-shell">
      <div className="announcement"><Sparkles size={13} /> Secure delivery: {formatPrice(DELIVERY_FEE)} per order <span>—</span> Complimentary gift wrapping</div>
      <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
        <button className="mobile-toggle icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu">{mobileMenu ? <X size={21} /> : <Menu size={21} />}</button>
        <button className="wordmark" onClick={() => navigate('home')} aria-label="Montana Cadeaux home"><img src="/montana-logo.png" alt="Montana Cadeaux" /></button>
        <nav className={`main-nav ${mobileMenu ? 'is-open' : ''}`}>
          <button onClick={() => navigate('collection', 'For Women')}>FOR WOMEN <ChevronDown size={13} /></button>
          <button onClick={() => navigate('collection', 'For Men')}>FOR MEN <ChevronDown size={13} /></button>
          <button onClick={() => navigate('collection', 'Pack 3 en 1')}>PACK 3 EN 1</button>
          <button onClick={() => navigate('collection', 'All')}>NEW ARRIVALS</button>
          {isAdmin && <button className="dashboard-nav-link" onClick={() => navigate('admin')} aria-label="Open admin dashboard"><LayoutDashboard size={14} /> DASHBOARD</button>}
        </nav>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setSearchOpen(!searchOpen)} aria-label="Search"><Search size={19} /></button>
          <button className={`icon-button account-button ${session ? 'is-authenticated' : ''}`} onClick={() => session ? supabase.auth.signOut() : setAuthOpen(true)} aria-label={session ? `Sign out ${accountName}` : 'Open account'} title={session ? `Signed in as ${accountName}. Click to sign out.` : 'Sign in'}>{session ? <span className="account-initials">{accountInitials}</span> : <User size={19} />}</button>
          <button className="bag-button icon-button" onClick={() => setCartOpen(true)} aria-label="Shopping bag"><ShoppingBag size={19} />{cartCount > 0 && <span>{cartCount}</span>}</button>
        </div>
      </header>
      <AnimatePresence>{searchOpen && <Motion.div className="search-bar" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><Search size={18} /><input autoFocus value={search} onChange={(event) => handleSearchChange(event.target.value)} placeholder="Search pieces, collections..." aria-label="Search products" /><button onClick={clearSearch} aria-label="Clear search"><X size={18} /></button></Motion.div>}</AnimatePresence>

      {activeView === 'admin' ? <AdminDashboard session={session} onSignIn={() => setAuthOpen(true)} onBack={() => navigate('home')} onSignOut={() => supabase.auth.signOut()} /> : <><main>
        {activeView === 'home' ? <Home products={products} navigate={navigate} addToCart={addToCart} setSelectedProduct={setSelectedProduct} setActiveCategory={setActiveCategory} submitNewsletter={submitNewsletter} email={email} setEmail={setEmail} /> : <CollectionView category={activeCategory} products={filteredProducts} navigate={navigate} addToCart={addToCart} setSelectedProduct={setSelectedProduct} />}
      </main><Footer navigate={navigate} openContact={() => setContactOpen(true)} /></>}
      <AnimatePresence>{selectedProduct && <ProductModal product={selectedProduct} close={() => setSelectedProduct(null)} addToCart={addToCart} />}</AnimatePresence>
      <AnimatePresence>{cartOpen && <CartDrawer cart={cart} total={cartTotal} close={() => setCartOpen(false)} updateQuantity={updateQuantity} remove={(id) => setCart((current) => current.filter((item) => item.id !== id))} checkout={() => { setCartOpen(false); setCheckout(true); window.scrollTo({ top: 0 }) }} />}</AnimatePresence>
      <AnimatePresence>{checkout && <Checkout cart={cart} total={cartTotal} close={() => setCheckout(false)} complete={placeOrder} email={session?.user?.email || ''} />}</AnimatePresence>
      <AnimatePresence>{orderComplete && <OrderConfirmation orderNumber={lastOrderNumber} close={() => setOrderComplete(false)} navigate={navigate} />}</AnimatePresence>
      <AnimatePresence>{authOpen && <AuthModal close={() => setAuthOpen(false)} mode="login" onSuccess={() => setAuthOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{contactOpen && <ContactModal close={() => setContactOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{toast && <Motion.div className="toast" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }}><Check size={16} />{toast}</Motion.div>}</AnimatePresence>
    </div>
  )
}

function Home({ products: items, navigate, addToCart, setSelectedProduct, submitNewsletter, email, setEmail }) {
  return <>
    <section className="hero">
      <div className="hero-content">
        <p className="eyebrow light">MONTANA CADEAUX · EST. 2024</p>
        <h1>The Art of<br /><em>Giving</em> Elegance.</h1>
        <p className="hero-subtitle">Discover exclusive accessories and perfect gifts, thoughtfully chosen for every meaningful moment.</p>
        <div className="hero-actions"><button className="button button-gold" onClick={() => navigate('collection', 'All')}>SHOP NOW <ArrowRight size={16} /></button><button className="text-button light-text" onClick={() => document.getElementById('collections').scrollIntoView({ behavior: 'smooth' })}>EXPLORE COLLECTIONS <ArrowRight size={15} /></button></div>
      </div>
      <div className="hero-side-note">A little luxury,<br />beautifully given.</div>
      <div className="hero-scroll">SCROLL TO DISCOVER <span /></div>
    </section>
    <section className="section collections-section" id="collections">
      <SectionHeading eyebrow="Curated for you" title="Find your signature" copy="Three distinct worlds. One unmistakable point of view." />
      <div className="collection-grid">{collections.map((collection) => <button className="collection-card" key={collection.name} onClick={() => navigate('collection', collection.name)}><img src={collection.image} alt="" /><span className="collection-overlay" /><div className="collection-card-content"><p>{collection.kicker}</p><h3>{collection.name}</h3><span>{collection.copy}</span><strong>DISCOVER <ArrowRight size={15} /></strong></div></button>)}</div>
    </section>
    <section className="service-strip" aria-label="Montana service promises">
      <div><Sparkles size={18} /><strong>Thoughtfully selected</strong><span>Accessories chosen for meaningful occasions.</span></div>
      <div><ShoppingBag size={18} /><strong>Gift-ready presentation</strong><span>Every order is prepared with exceptional care.</span></div>
      <div><Truck size={18} /><strong>Delivery across Tunisia</strong><span>Clear checkout details before you place an order.</span></div>
    </section>
    <section className="section product-section">
      <div className="section-heading row-heading"><SectionHeading eyebrow="The edit" title="Bestsellers" copy="The pieces our community keeps coming back to." /><button className="text-button" onClick={() => navigate('collection', 'All')}>VIEW ALL <ArrowRight size={15} /></button></div>
      <ProductGrid products={items.filter((product) => product.tag === 'Bestseller' || product.tag === 'Signature')} addToCart={addToCart} setSelectedProduct={setSelectedProduct} />
    </section>
    <section className="gift-banner">
      <div className="gift-banner-copy"><p className="eyebrow">The Montana ritual</p><h2>For the moments<br /><em>worth remembering.</em></h2><p>Our signature sets arrive ready to make an impression — from the first glance to the final unboxing.</p><button className="button button-outline" onClick={() => navigate('collection', 'Pack 3 en 1')}>DISCOVER GIFT SETS <ArrowRight size={16} /></button></div>
      <div className="gift-image"><img src="https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1200&q=85" alt="Montana Cadeaux gift set" /></div>
    </section>
    <section className="section product-section arrivals"><div className="section-heading row-heading"><SectionHeading eyebrow="Just in" title="New arrivals" copy="Fresh perspectives on everyday elegance." /><button className="text-button" onClick={() => navigate('collection', 'All')}>SHOP NEW <ArrowRight size={15} /></button></div><ProductGrid products={items.filter((product) => product.tag === 'New' || product.id === 4)} addToCart={addToCart} setSelectedProduct={setSelectedProduct} /></section>
    <section className="story-section"><div className="story-image"><img src="https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?auto=format&fit=crop&w=1200&q=85" alt="Woman wearing Montana jewellery" /></div><div className="story-copy"><p className="eyebrow">The Montana story</p><h2>Objects with<br /><em>meaning.</em></h2><p>Montana Cadeaux was born from a simple belief: the most memorable gifts are the ones that feel deeply considered. We seek out pieces with a quiet presence — made to be worn, kept and remembered.</p><p>From our studio in Paris to your doorstep, every detail is chosen with intention.</p><button className="text-button" onClick={() => setEmail('')}>OUR PHILOSOPHY <ArrowRight size={15} /></button></div></section>
    <section className="newsletter"><div><p className="eyebrow">A note from Montana</p><h2>Stay in the know.</h2><p>Join our private circle for first access to new arrivals, thoughtful stories and little surprises.</p></div><form onSubmit={submitNewsletter}><input type="email" required placeholder="Your email address" value={email} onChange={(event) => setEmail(event.target.value)} /><button className="button button-dark">JOIN THE CIRCLE <ArrowRight size={15} /></button></form></section>
  </>
}

function SectionHeading({ eyebrow, title, copy }) { return <div className="section-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{copy}</p></div> }

function ProductGrid({ products: items, addToCart, setSelectedProduct }) { return <div className="product-grid">{items.map((product) => <ProductCard key={product.id} product={product} addToCart={addToCart} setSelectedProduct={setSelectedProduct} />)}</div> }

function ProductCard({ product, addToCart, setSelectedProduct }) { const outOfStock = Number(product.stock_quantity || 0) === 0; return <article className="product-card"><div className="product-image" onClick={() => setSelectedProduct(product)}><img src={product.image} alt={product.name} />{product.tag && <span className="product-tag">{product.tag}</span>}{outOfStock && <span className="product-tag">Out of Stock</span>}<button className="heart-button" aria-label="Add to wishlist" onClick={(event) => { event.stopPropagation(); }}> <Heart size={16} /></button><div className="quick-add"><button disabled={outOfStock} onClick={(event) => { event.stopPropagation(); addToCart(product) }}>{outOfStock ? 'OUT OF STOCK' : 'ADD TO BAG'} {!outOfStock && <Plus size={14} />}</button></div></div><div className="product-info"><div><p className="product-type">{product.type}</p><h3>{product.name}</h3></div><p className="product-price">{formatPrice(product.price)}</p></div></article> }

function CollectionView({ category, products: items, navigate, addToCart, setSelectedProduct }) { const title = category === 'All' ? 'All pieces' : category; const intro = category === 'Pack 3 en 1' ? 'Three considered pieces, presented as one unforgettable gesture.' : category === 'For Women' ? 'Jewellery and accessories with a quietly feminine point of view.' : category === 'For Men' ? 'Modern essentials for a life well lived.' : 'The complete Montana edit, curated for every occasion.'; return <><section className="collection-hero"><p className="eyebrow">Montana collection</p><h1>{title}</h1><p>{intro}</p></section><section className="section collection-results"><div className="filter-bar"><span>{items.length} pieces</span><div><button className={category === 'All' ? 'active' : ''} onClick={() => navigate('collection', 'All')}>ALL</button><button className={category === 'For Women' ? 'active' : ''} onClick={() => navigate('collection', 'For Women')}>WOMEN</button><button className={category === 'For Men' ? 'active' : ''} onClick={() => navigate('collection', 'For Men')}>MEN</button><button className={category === 'Pack 3 en 1' ? 'active' : ''} onClick={() => navigate('collection', 'Pack 3 en 1')}>PACK 3 EN 1</button></div><button className="filter-sort">SORT BY <ChevronDown size={14} /></button></div>{items.length ? <ProductGrid products={items} addToCart={addToCart} setSelectedProduct={setSelectedProduct} /> : <div className="empty-state"><p>No pieces found.</p><button className="button button-dark" onClick={() => navigate('collection', 'All')}>VIEW ALL PIECES</button></div>}</section></> }

function ProductModal({ product, close, addToCart }) { const outOfStock = Number(product.stock_quantity || 0) === 0; return <Motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}><Motion.div className="product-modal" initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 25 }} onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={close}><X size={20} /></button><div className="modal-image"><img src={product.image} alt={product.name} /></div><div className="modal-details"><p className="eyebrow">{product.category} · {product.type}</p><h2>{product.name}</h2><p className="modal-price">{formatPrice(product.price)}</p><p className="modal-description">{product.description}</p><div className="variation"><span>COLOUR</span><div>{(product.colors || []).map((color) => <button key={color}>{color}</button>)}</div></div><p className="stock"><span /> {outOfStock ? 'Out of Stock' : `${product.stock_quantity} in stock — ready to ship`}</p><button disabled={outOfStock} className="button button-dark full-button" onClick={() => { addToCart(product); close() }}>{outOfStock ? 'OUT OF STOCK' : 'ADD TO BAG'} {!outOfStock && <ShoppingBag size={16} />}</button><p className="shipping-note"><Truck size={15} /> Delivery fee: {formatPrice(DELIVERY_FEE)} per order · Gift wrapping available</p></div></Motion.div></Motion.div> }

function CartDrawer({ cart, total, close, updateQuantity, remove, checkout }) { const finalTotal = calculateOrderTotal(total); return <Motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}><Motion.aside className="cart-drawer" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28 }} onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><p className="eyebrow">Your selection</p><h2>Your bag <span>({cart.reduce((sum, item) => sum + item.quantity, 0)})</span></h2></div><button className="icon-button" onClick={close}><X size={20} /></button></div>{cart.length ? <><div className="cart-items">{cart.map((item) => <div className="cart-item" key={item.id}><img src={item.image} alt="" /><div className="cart-item-info"><h3>{item.name}</h3><p>{formatPrice(item.price)}</p><div className="quantity"><button onClick={() => updateQuantity(item.id, -1)}><Minus size={13} /></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id, 1)}><Plus size={13} /></button></div></div><button className="remove-item" onClick={() => remove(item.id)}>Remove</button></div>)}</div><div className="drawer-bottom"><div className="subtotal"><span>SUBTOTAL</span><strong>{formatPrice(total)}</strong></div><div className="summary-line cart-delivery"><span>DELIVERY FEE</span><strong>{formatPrice(DELIVERY_FEE)}</strong></div><div className="summary-total cart-total"><span>TOTAL</span><strong>{formatPrice(finalTotal)}</strong></div><p className="delivery-copy">One fixed delivery fee is applied once per order.</p><button className="button button-dark full-button" onClick={checkout}>PROCEED TO CHECKOUT <ArrowRight size={15} /></button></div></> : <div className="empty-cart"><ShoppingBag size={30} /><p>Your bag is waiting to be filled.</p><button className="button button-outline-dark" onClick={close}>CONTINUE SHOPPING</button></div>}</Motion.aside></Motion.div> }

function Checkout({ cart, total, close, complete, email }) {
  const [form, setForm] = useState({ name: '', phone: '', governorate: '', city: '', address: '', notes: '', email })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const valid = form.name.trim().length >= 2
    && form.phone.trim().length >= 6
    && form.governorate.trim()
    && form.city.trim().length >= 2
    && form.address.trim().length >= 5
  const finalTotal = calculateOrderTotal(total)
  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    if (!valid) {
      setFormError('Please enter a complete delivery address (at least 5 characters), a valid name, phone number, and city.')
      return
    }
    setFormError('')
    setBusy(true)
    await complete(form)
    setBusy(false)
  }
  return <Motion.div className="checkout-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <div className="checkout-page">
      <button className="checkout-back" onClick={close}><ChevronLeft size={17} /> Back to bag</button>
      <div className="checkout-grid">
        <div>
          <p className="eyebrow">Montana Cadeaux</p>
          <h1>Complete your order.</h1>
          <p className="checkout-intro">Your pieces will be carefully wrapped and delivered to your door.</p>
          <form className="checkout-form" onSubmit={submit}>
            <label>EMAIL ADDRESS<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com (optional)" /></label>
            <label>FULL NAME<input required minLength="2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your full name" /></label>
            <label>PHONE NUMBER<input required minLength="6" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+216 00 000 000" /></label>
            <label>GOVERNORATE<input required value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value })} placeholder="Tunis" /></label>
            <label>CITY / DELEGATION<input required minLength="2" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Tunis" /></label>
            <label>COMPLETE DELIVERY ADDRESS<textarea required minLength="5" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, building, apartment..." /></label>
            <label>ADDITIONAL NOTES<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional delivery notes" /></label>
            {formError && <p className="checkout-form-error" role="alert">{formError}</p>}
            <div className="payment-choice"><span>PAYMENT</span><div><Check size={15} /> Cash on delivery</div></div>
            <button className="button button-dark full-button" disabled={busy}>{busy ? 'SAVING ORDER...' : 'PLACE ORDER'} <ArrowRight size={15} /></button>
            {busy && <p className="checkout-processing" role="status"><span className="processing-dot" /> Please wait while we securely confirm your order.</p>}
          </form>
        </div>
        <div className="checkout-summary">
          <p className="eyebrow">Order summary</p>
          {cart.map((item) => <div className="summary-item" key={item.id}><img src={item.image} alt="" /><div><p>{item.name}</p><span>Qty {item.quantity} · {formatPrice(item.price)}</span></div><strong>{formatPrice(item.price * item.quantity)}</strong></div>)}
          <div className="summary-line"><span>Delivery Fee</span><strong>{formatPrice(DELIVERY_FEE)}</strong></div>
          <div className="summary-total"><span>Total</span><strong>{formatPrice(finalTotal)}</strong></div>
        </div>
      </div>
    </div>
  </Motion.div>
}

function OrderConfirmation({ orderNumber, close, navigate }) { return <Motion.div className="modal-backdrop confirmation-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="confirmation"><div className="confirmation-mark"><Check size={24} /></div><p className="eyebrow">Thank you</p><h2>Your order is on its way.</h2><p>We’ve received your order and will be in touch shortly to confirm delivery. Your gift is already being prepared with care.</p><p className="order-number">ORDER NO. {orderNumber}</p><button className="button button-dark" onClick={() => { close(); navigate('home') }}>CONTINUE EXPLORING <ArrowRight size={15} /></button></div></Motion.div> }

function AuthModal({ close, mode: initialMode, onSuccess }) {
  const [mode, setMode] = useState(initialMode)
  const [form, setForm] = useState({ name: '', phone: '', address: '', city: '', email: '', password: '' })
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setMessageType('error')
    const email = form.email.trim().toLowerCase()
    const password = form.password
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: form.name, phone: form.phone, address: form.address, city: form.city } },
      })
    setBusy(false)
    if (result.error) {
      setMessage(mode === 'login' && result.error.message === 'Invalid login credentials'
        ? 'The email or password is incorrect. Check the Supabase user account or reset its password.'
        : result.error.message === 'Email signups are disabled'
          ? 'Email signups are disabled in Supabase. Enable the Email provider in Authentication settings.'
        : result.error.message === 'Email not confirmed'
          ? 'Email confirmation is enabled in Supabase. Disable Confirm email in Authentication settings, then create the account again.'
        : result.error.message)
      return
    }
    if (mode === 'signup' && !result.data.session) {
      localStorage.setItem('montana-pending-profile', JSON.stringify({ ...form, userId: result.data.user?.id }))
      setMessageType('success')
      setMode('login')
      setMessage('Account created successfully. Sign in to continue.')
      return
    }
    if (mode === 'signup') {
      const { error: profileError } = await supabase.from('profiles').upsert({ id: result.data.user.id, full_name: form.name, email: form.email, phone: form.phone })
      const { error: addressError } = await supabase.from('addresses').insert({ user_id: result.data.user.id, full_address: form.address, city: form.city, phone: form.phone, is_default: true })
      if (profileError || addressError) {
        setMessage(profileError?.message || addressError?.message || 'We could not save your profile details.')
        setBusy(false)
        return
      }
    }
    if (mode === 'login') {
      const pending = JSON.parse(localStorage.getItem('montana-pending-profile') || 'null')
      if (pending && pending.email === email) {
        const { error: profileError } = await supabase.from('profiles').upsert({ id: result.data.user.id, full_name: pending.name, email: pending.email, phone: pending.phone })
        const { error: addressError } = await supabase.from('addresses').insert({ user_id: result.data.user.id, full_address: pending.address, city: pending.city, phone: pending.phone, is_default: true })
        if (profileError || addressError) {
          setMessage(profileError?.message || addressError?.message || 'We could not save your profile details.')
          setBusy(false)
          return
        }
        localStorage.removeItem('montana-pending-profile')
      }
    }
    localStorage.removeItem('montana-pending-profile')
    onSuccess()
  }

  return <Motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
    <Motion.div className="auth-modal" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={close}><X size={20} /></button>
      <div className="auth-brand-panel"><div className="auth-monogram">MC</div><p className="eyebrow light">MONTANA CADEAUX</p><p className="auth-brand-line">The art of<br /><em>giving elegance.</em></p><span className="auth-brand-rule" /></div>
      <div className="auth-form-panel"><p className="eyebrow">Your private account</p>
      <h2>{mode === 'login' ? 'Welcome back.' : 'Join the circle.'}</h2>
      <p className="auth-copy">{mode === 'login' ? 'Sign in to continue to your saved details, orders and curated selections.' : 'Create your account to save your details and follow every order.'}</p>
      <form className={`auth-form ${mode === 'signup' ? 'signup-form' : ''}`} onSubmit={submit}>
        {mode === 'signup' && <><label>FULL NAME<input required autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your full name" /></label><label>PHONE NUMBER<input required type="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+216 00 000 000" /></label><label>CITY<input required autoComplete="address-level2" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Tunis" /></label><label>DELIVERY ADDRESS<textarea required autoComplete="street-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Street, building, apartment..." /></label></>}
        <label>EMAIL ADDRESS<input type="email" required autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
        <label>PASSWORD<input type="password" required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter your password" /></label>
        {message && <p className={`auth-message auth-message-${messageType}`} role={messageType === 'error' ? 'alert' : 'status'}>{message}</p>}
        <button className="button button-dark full-button" disabled={busy}>{busy ? 'SIGNING YOU IN...' : mode === 'login' ? 'SIGN IN TO YOUR ACCOUNT' : 'CREATE MY ACCOUNT'} <ArrowRight size={15} /></button>
      </form>
      <button className="auth-switch" onClick={() => { setMessage(''); setMessageType('error'); setMode(mode === 'login' ? 'signup' : 'login') }}>{mode === 'login' ? 'New to Montana? Create an account' : 'Already have an account? Sign in'}</button></div>
    </Motion.div>
  </Motion.div>
}

function ContactModal({ close }) { return <Motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}><Motion.div className="contact-modal" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }} onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={close}><X size={20} /></button><p className="eyebrow">Montana Cadeaux</p><h2>Let’s stay connected.</h2><p className="contact-intro">Follow our latest pieces or speak with us directly about your order.</p><div className="contact-options"><a className="contact-option contact-instagram" href="https://www.instagram.com/montana_cadeaux?exln=MTJqcTh5OGR6Y2czaA==" target="_blank" rel="noreferrer"><span className="contact-icon"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg></span><span><strong>Instagram</strong><small>@montana_cadeaux</small></span><ArrowRight size={16} /></a><a className="contact-option contact-whatsapp" href="https://wa.me/21622011095" target="_blank" rel="noreferrer"><span className="contact-icon contact-whatsapp-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5Z" /><path d="M8.8 8.6c.4-.4.8-.2 1 .2l.6 1.2c.2.3.1.6-.1.8l-.5.4c.5 1 1.2 1.7 2.2 2.2l.4-.5c.2-.2.5-.3.8-.1l1.2.6c.4.2.5.6.2 1-.4.6-.9.9-1.6.8-2.7-.5-5-2.8-5.5-5.5-.1-.7.2-1.2.8-1.6Z" /></svg></span><span><strong>WhatsApp</strong><small>+216 22 011 095</small></span><ArrowRight size={16} /></a></div></Motion.div></Motion.div> }

function Footer({ navigate, openContact }) { return <footer><div className="footer-top"><div className="footer-brand"><button className="wordmark footer-wordmark" onClick={() => navigate('home')} aria-label="Montana Cadeaux home"><img src="/montana-logo.png" alt="Montana Cadeaux" /></button><p>The art of giving elegance.</p><div className="socials"><a href="https://www.instagram.com/montana_cadeaux?exln=MTJqcTh5OGR6Y2czaA==" target="_blank" rel="noreferrer" aria-label="Montana Cadeaux on Instagram"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg></a><a href="https://facebook.com" target="_blank" rel="noreferrer" aria-label="Montana Cadeaux on Facebook">f</a></div></div><div className="footer-links"><div><h4>Explore</h4><button onClick={() => navigate('collection', 'For Women')}>For Women</button><button onClick={() => navigate('collection', 'For Men')}>For Men</button><button onClick={() => navigate('collection', 'Pack 3 en 1')}>Pack 3 en 1</button><button onClick={() => navigate('collection', 'All')}>New Arrivals</button></div><div><h4>Information</h4><button onClick={() => setTimeout(() => window.scrollTo({ top: 0 }), 0)}>Delivery & Returns</button><button onClick={() => setTimeout(() => window.scrollTo({ top: 0 }), 0)}>Our Story</button><button onClick={openContact}>Contact</button></div></div></div><div className="footer-bottom"><span>© 2024 Montana Cadeaux</span><span>Designed with intention in Paris</span><span>Privacy · Terms</span></div></footer> }

export default App

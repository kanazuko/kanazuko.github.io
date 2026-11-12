import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { createServer, preview } from 'vite'

// All public data/images are fixtures. No live API, Meta, order or email call.
process.env.VITE_SUPABASE_URL='https://test.supabase.co'
process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_public_browser_test'
const executablePath=process.env.BROWSER_PATH||['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/chromium'].find(existsSync)
if(!executablePath)throw new Error('Local Chromium required')
const production=process.argv.includes('--preview')
const fixtureHost=production?'blsezjyhiholzwmqewef.supabase.co':'test.supabase.co'
const server=production?await preview({preview:{host:'127.0.0.1',port:5182,strictPort:true}}):await createServer({server:{host:'127.0.0.1',port:5182,strictPort:true}})
if(!production)await server.listen()
const browser=await chromium.launch({executablePath,headless:true})
const screenshots=await mkdtemp(join(tmpdir(),'prart-public-stage4-'))
const category={id:'rings',parent_id:null,name:'Anillos',slug:'anillos',description:'Colección de prueba',sort_order:1}
const product={id:'11111111-1111-4111-8111-111111111111',name:'Anillo de prueba',slug:'anillo-prueba',price:125,description:'Acero dorado',availability:'available',material:'Acero',color:'Dorado',size:'7',attributes:{},is_featured:true,category,tags:[],images:[0,1].map(i=>({id:String(i),storage_path:`products/test/${i}.svg`,alt_text:`Foto ${i+1} del anillo`,sort_order:i}))}
const products=[product,{...product,id:'22222222-2222-4222-8222-222222222222',name:'Anillo de plata',slug:'anillo-plata',description:'Acero plateado',price:200,color:'Plateado',images:[product.images[0]]}]
const errors=[],requests=[]
try{
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'})
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url())
    if(url.hostname==='127.0.0.1')return route.continue()
    if(url.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:''})
    requests.push(url.pathname)
    const reply=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
    if(url.hostname===fixtureHost&&url.pathname==='/rest/v1/rpc/instagram_runtime_status')return reply({schema_version:2,maintenance:true,frontend_ready:false,deployment_epoch:'3cd91507-439a-4a97-85bc-1dac9d218856'})
    if(url.hostname!==fixtureHost||request.method()!=='GET'){errors.push('Unexpected external request');return route.abort()}
    if(url.pathname==='/rest/v1/admin_users')return reply({user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})
    if(url.pathname==='/rest/v1/instagram_posts')return reply([])
    if(url.pathname==='/rest/v1/categories')return reply(url.searchParams.has('slug')?category:[category])
    if(url.pathname==='/rest/v1/products'){
      if(url.searchParams.has('slug'))return reply(products.find(p=>'eq.'+p.slug===url.searchParams.get('slug')))
      return reply(url.searchParams.has('id')?products.filter(p=>'neq.'+p.id!==url.searchParams.get('id')):products)
    }
    if(url.pathname.startsWith('/storage/v1/object/public/product-images/'))return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#f3eee4"/><circle cx="300" cy="300" r="120" fill="none" stroke="#b79a55" stroke-width="30"/></svg>'})
    errors.push('Unexpected public endpoint');return route.abort()
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:5182/')
  await page.getByRole('heading',{name:'Detalles que permanecen.'}).waitFor()
  await page.getByRole('link',{name:'Descubrir colección'}).click()
  await page.getByLabel('Buscar piezas').fill('dorado')
  await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===1)
  assert.equal(await page.locator('.product-card').count(),1)
  await page.getByLabel('Buscar piezas').fill('')
  await page.getByRole('combobox',{name:/^Ordenar/}).selectOption('price-desc')
  assert.match(await page.locator('.product-card h3').first().textContent(),/Anillo de plata/)
  await page.getByRole('combobox',{name:/^Categoría/}).selectOption('anillos')
  assert.equal(await page.locator('.product-card').count(),2)
  await page.locator('.product-card h3').getByRole('link',{name:'Anillo de prueba',exact:true}).click()
  await page.getByRole('heading',{name:'Anillo de prueba',exact:true}).waitFor()
  await page.waitForFunction(()=>{const image=document.querySelector('.product-gallery__main img');return image?.complete&&image.naturalWidth>0})
  await page.getByRole('button',{name:'Ampliar fotografía 2 de Anillo de prueba',exact:true}).click()
  await page.getByRole('dialog',{name:'Fotografías de Anillo de prueba'}).waitFor()
  await page.keyboard.press('Escape')
  await page.screenshot({path:join(screenshots,'public-product-desktop.png'),fullPage:true})
  await page.getByRole('button',{name:'← Regresar a catálogo'}).click()
  await page.getByRole('heading',{name:'Catálogo',exact:true}).waitFor()
  await page.goto('http://127.0.0.1:5182/#/categoria/anillos')
  await page.getByRole('heading',{name:'Anillos',exact:true}).waitFor()
  await page.reload()
  await page.getByRole('heading',{name:'Anillos',exact:true}).waitFor()
  await page.setViewportSize({width:390,height:844})
  for(const image of await page.locator('.product-card img').all())await image.scrollIntoViewIfNeeded()
  await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.product-card img')];return images.length>0&&images.every(i=>i.complete&&i.naturalWidth>0)})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:join(screenshots,'public-category-mobile.png'),fullPage:true})
  assert.equal(requests.some(p=>p.includes('/functions/')||p.includes('instagram')||p.includes('/rpc/')),false)
  if(production){
    const adminId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const token=Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:adminId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test'
    await page.evaluate(({token,adminId})=>localStorage.setItem('sb-blsezjyhiholzwmqewef-auth-token',JSON.stringify({access_token:token,refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:adminId,email:'admin@example.com',role:'authenticated',aud:'authenticated'}})),{token,adminId})
    await page.goto('http://127.0.0.1:5182/#/admin/instagram')
    await page.reload()
    await page.getByText('Instagram está en mantenimiento. No se enviará contenido; el catálogo continúa disponible.',{exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Verificar conexión',exact:true}).isDisabled(),true)
    assert.equal(await page.getByRole('button',{name:'Publicar en Instagram',exact:true}).isDisabled(),true)
    assert.equal(requests.some(p=>p.startsWith('/functions/')),false)
    await page.screenshot({path:join(screenshots,'production-maintenance-mobile.png'),fullPage:true})
  }
  assert.deepEqual(errors,[])
  console.log(`${production?'Production build':'Public catalog'} checks passed: home, search/filter/sort, product, photos/viewer, back navigation, category deep-link/reload, mobile layout${production?', maintenance panel without Edge calls':''}. Screenshots: ${screenshots}`)
}finally{await browser.close();if(production)await new Promise(resolve=>server.httpServer.close(resolve));else await server.close()}

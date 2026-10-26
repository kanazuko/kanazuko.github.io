import { Outlet } from 'react-router-dom'
import Footer from '../components/navigation/Footer'
import Header from '../components/navigation/Header'

export default function SiteLayout() {
  return (
    <div className="site-shell">
      <Header />
      <main className="site-main"><Outlet /></main>
      <Footer />
    </div>
  )
}

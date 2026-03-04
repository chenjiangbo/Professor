import Header from '@/components/Header'
import Hero from '@/components/Hero'
import WorkspaceMockup from '@/components/WorkspaceMockup'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <div className="relative flex min-h-screen w-full flex-col selection:bg-primary/30">
      <Header />
      <main className="flex flex-1 flex-col items-center px-4 pt-16 pb-24 lg:px-8">
        <Hero />
        <WorkspaceMockup />
      </main>
      <Footer />
    </div>
  )
}

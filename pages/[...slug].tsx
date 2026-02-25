import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function LegacyRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (router && router.isReady) {
      router.replace('/')
    }
  }, [router])

  return (
    <div className="mt-10 w-full px-4 text-center text-white">
      <p>Redirecting to the new Professor experience...</p>
    </div>
  )
}

import { useAnalytics } from '~/components/context/analytics'
import SquigglyLines from '../components/SquigglyLines'
import { CHECKOUT_URL, RATE_LIMIT_COUNT } from '~/utils/constants'

export default () => {
  const { analytics } = useAnalytics()

  return (
    <div>
      <h2 className="mt-10 max-w-5xl pb-10 text-center text-4xl font-bold sm:text-7xl">
        Daily free quota: {RATE_LIMIT_COUNT}. Need more? Click
        <span className="relative whitespace-nowrap text-[#3290EE]">
          <SquigglyLines />
          <a
            className="relative text-pink-400 hover:underline"
            href={CHECKOUT_URL}
            onClick={() => analytics.track('ShopLink Clicked')}
          >
            purchase
          </a>
        </span>
        credits 💰
      </h2>
      <div className="min-h-screen min-w-fit border-2 border-purple-700">
        <iframe src={CHECKOUT_URL} width="100%" height="1024px"></iframe>
      </div>
    </div>
  )
}

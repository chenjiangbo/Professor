import type { GetServerSideProps } from 'next'

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/user/dashboard',
      permanent: false,
    },
  }
}

export default function UserVideosRedirectPage() {
  return null
}

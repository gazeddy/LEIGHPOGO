// Legacy batch QR links now point to the single community gift pool.
export default function LegacyGiftRedirect() { return null }
export async function getServerSideProps() {
  return { redirect: { destination: "/gifts", permanent: false } }
}

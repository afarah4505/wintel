import { WalletDashboard } from '@/components/wallet/WalletDashboard';

interface Props {
  params: Promise<{ address: string }>;
}

export default async function WalletPage({ params }: Props) {
  const { address } = await params;
  return <WalletDashboard address={address} />;
}

export async function generateMetadata({ params }: Props) {
  const { address } = await params;
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return {
    title: `Wallet ${short} — Wallet Intel`,
    description: `Clean analysis for Solana wallet ${address}`,
  };
}

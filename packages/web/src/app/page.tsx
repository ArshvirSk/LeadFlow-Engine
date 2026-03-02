import { redirect } from 'next/navigation';

// Root page — redirect authenticated users to /leads
export default function RootPage() {
  redirect('/leads');
}

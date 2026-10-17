import { MailCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';

export function VerifyEmail() {
  return (
    <AuthLayout title="Check your inbox">
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="h-10 w-10 text-brand-500" aria-hidden="true" />
        <p className="text-sm text-content-muted">
          We've sent a verification link to your email. Click it to activate your account, then sign
          in.
        </p>
        <Link to="/login" className="font-medium text-brand-500 hover:underline">
          Go to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}

import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';

export function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <EmptyState
        icon={Compass}
        title="This page doesn't exist"
        description="The link may be broken, or the page may have moved."
        action={
          <Link to="/">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        }
      />
    </div>
  );
}

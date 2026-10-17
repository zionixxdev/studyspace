import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, CardBody } from '@/components/ui/Card';
import { Avatar, EmptyState, Skeleton } from '@/components/ui/Feedback';

interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  restricted?: boolean;
}

export default function Profile() {
  const { username } = useParams<{ username: string }>();

  const profile = useQuery({
    queryKey: ['profile', username],
    enabled: !!username,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .ilike('username', username!)
        .maybeSingle();
      if (error) throw error;
      return data as PublicProfile | null;
    },
  });

  if (profile.isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!profile.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState icon={Lock} title="No such user" description="This profile doesn't exist or is private." />
      </div>
    );
  }

  const p = profile.data;
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardBody className="flex items-center gap-4 pt-6">
          <Avatar name={p.display_name} src={p.avatar_url} size={72} />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{p.display_name}</h1>
            <p className="text-sm text-content-muted">@{p.username}</p>
            {p.bio && <p className="mt-2 text-sm">{p.bio}</p>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

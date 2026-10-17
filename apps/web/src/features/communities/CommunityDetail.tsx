import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { UsersRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import type { Group } from '@studyspace/shared';

interface Member {
  user_id: string;
  role: string;
  profiles: { username: string; display_name: string; avatar_url: string | null } | null;
}

export default function CommunityDetail() {
  const { groupId } = useParams<{ groupId: string }>();

  const group = useQuery({
    queryKey: ['group', groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase.from('groups').select('*').eq('id', groupId!).maybeSingle();
      if (error) throw error;
      return data as Group | null;
    },
  });

  const members = useQuery({
    queryKey: ['group-members', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from('group_members')
        .select('user_id, role, profiles(username, display_name, avatar_url)')
        .eq('group_id', groupId!);
      if (error) throw error;
      return (data ?? []) as unknown as Member[];
    },
  });

  if (group.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!group.data) {
    return <EmptyState icon={UsersRound} title="Community not found" description="It may be private or removed." />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardBody className="pt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{group.data.name}</h1>
              {group.data.description && <p className="mt-1 text-sm text-content-muted">{group.data.description}</p>}
            </div>
            <Badge tone={group.data.visibility === 'private' ? 'warn' : 'brand'}>{group.data.visibility}</Badge>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members ({members.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardBody>
          {members.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <ul className="divide-y divide-surface-border">
              {members.data?.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm">{m.profiles?.display_name ?? 'Member'}</span>
                  <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{m.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

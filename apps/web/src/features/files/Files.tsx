import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Folder, HardDrive, Image as ImageIcon, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { formatBytes, timeAgo } from '@/lib/utils';
import { ALLOWED_DOCUMENT_MIME, LIMITS, type DriveFile } from '@studyspace/shared';

interface StorageInfo {
  usedBytes: number;
  perUserLimitBytes: number;
  drive: { limit: number | null; usage: number | null };
}

export default function Files() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const files = useQuery({
    queryKey: ['files'],
    queryFn: () => api.get<{ items: DriveFile[] }>('/files'),
  });

  const storage = useQuery({
    queryKey: ['storage'],
    queryFn: () => api.get<StorageInfo>('/files/storage'),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!ALLOWED_DOCUMENT_MIME.includes(file.type as (typeof ALLOWED_DOCUMENT_MIME)[number])) {
        throw new Error(`Unsupported file type: ${file.type || 'unknown'}`);
      }
      if (file.size > LIMITS.MAX_FILE_BYTES) {
        throw new Error(`File is larger than ${formatBytes(LIMITS.MAX_FILE_BYTES)}`);
      }
      return api.upload<{ file: DriveFile }>(
        '/files/uploads',
        file,
        { scope: 'private', idempotencyKey: crypto.randomUUID() },
        setProgress,
      );
    },
    onSuccess: () => {
      toast('File uploaded', 'success');
      setProgress(null);
      void qc.invalidateQueries({ queryKey: ['files'] });
      void qc.invalidateQueries({ queryKey: ['storage'] });
    },
    onError: (e: Error) => {
      setProgress(null);
      toast(e.message, 'error');
    },
  });

  const usedPct = storage.data
    ? Math.min(100, (storage.data.usedBytes / storage.data.perUserLimitBytes) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Files</h1>
        <Button size="sm" onClick={() => inputRef.current?.click()} loading={upload.isPending}>
          <Upload className="h-4 w-4" aria-hidden="true" /> Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ALLOWED_DOCUMENT_MIME.join(',')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = '';
          }}
        />
      </header>

      <Card>
        <CardBody className="pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-content-muted">
              <HardDrive className="h-4 w-4" aria-hidden="true" /> Your storage
            </span>
            <span>
              {storage.data ? `${formatBytes(storage.data.usedBytes)} / ${formatBytes(storage.data.perUserLimitBytes)}` : '—'}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${usedPct}%` }} />
          </div>
          {progress !== null && (
            <p className="mt-2 text-xs text-brand-500" role="status">
              Uploading… {progress}%
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your library</CardTitle>
        </CardHeader>
        <CardBody>
          {files.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : files.data?.items.length ? (
            <ul className="divide-y divide-surface-border">
              {files.data.items.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-3">
                  <span className="rounded-lg bg-surface-muted p-2">
                    {f.mime.startsWith('image/') ? (
                      <ImageIcon className="h-4 w-4 text-content-muted" aria-hidden="true" />
                    ) : (
                      <FileText className="h-4 w-4 text-content-muted" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-content-muted">
                      {formatBytes(f.size_bytes)} · {timeAgo(f.created_at)}
                    </p>
                  </div>
                  <Badge tone={f.upload_state === 'completed' ? 'success' : f.upload_state === 'failed' ? 'danger' : 'warn'}>
                    {f.upload_state}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Folder}
              title="No files yet"
              description="Upload a PDF or image to study from, then share it with a room or community."
              action={
                <Button size="sm" onClick={() => inputRef.current?.click()}>
                  Upload your first file
                </Button>
              }
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

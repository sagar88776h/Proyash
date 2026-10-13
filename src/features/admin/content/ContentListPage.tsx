import { useQuery } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { Badge } from '@/components/ui/Feedback';
import { CONTENT_KEYS, PAGE_DEFINITIONS, type ContentKey } from '@/content/registry';
import { formatDateTime } from '@/lib/format';
import { contentState, listContent, type ContentRow } from '../api/admin';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';

export function ContentListPage() {
  const query = useQuery({ queryKey: ['admin', 'content'], queryFn: listContent });
  type Row = { key: ContentKey; row: ContentRow | undefined };
  const columns: Column<Row>[] = [
    { key: 'page', header: 'Page', cell: (r) => PAGE_DEFINITIONS[r.key].label },
    { key: 'path', header: 'Address', cell: (r) => <code className="text-xs">{PAGE_DEFINITIONS[r.key].path}</code>, hideOnMobile: true },
    {
      key: 'status',
      header: 'Website shows',
      cell: (r) => {
        const s = contentState(r.row);
        return (
          <span className="flex flex-wrap gap-1.5">
            {s.hasPublished ? <Badge tone="success">Published version {r.row?.version}</Badge> : <Badge tone="neutral">Default text</Badge>}
            {s.hasChanges && <Badge tone="warning">Unpublished changes</Badge>}
          </span>
        );
      },
    },
    { key: 'updated', header: 'Last published', cell: (r) => (r.row?.published_at ? formatDateTime(r.row.published_at) : '—'), hideOnMobile: true },
  ];
  return (
    <>
      <PageHeader
        title="Page content"
        description="Edit the text on each public page. Changes are saved as a draft and appear on the website only when published. Contact and payment details are managed in Settings."
      />
      <QueryState query={query}>
        {(rows) => {
          const byKey = new Map(rows.map((r) => [r.key, r]));
          const data: Row[] = CONTENT_KEYS.map((key) => ({ key, row: byKey.get(key) }));
          return <DataTable rows={data} columns={columns} rowKey={(r) => r.key} rowHref={(r) => `/admin/content/${r.key}`} caption="Website pages" />;
        }}
      </QueryState>
    </>
  );
}

import { Compass } from 'lucide-react';
import { Card, EmptyState } from '../components/ui';

export default function NotFoundPage() {
  return (
    <Card>
      <EmptyState icon={<Compass className="size-6" />} title="Page not found" description="This page doesn’t exist." action={<a href="#/" className="text-sm font-medium text-brand">Back to dashboard</a>} />
    </Card>
  );
}

import { QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion } from 'framer-motion';
import { RouterProvider } from 'react-router';
import { queryClient } from '@/lib/query';
import { router } from '@/router';

// Animation features load asynchronously so they stay off the critical path.
const loadMotionFeatures = () => import('@/lib/motionFeatures').then((m) => m.default);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={loadMotionFeatures} strict>
        <RouterProvider router={router} />
      </LazyMotion>
    </QueryClientProvider>
  );
}

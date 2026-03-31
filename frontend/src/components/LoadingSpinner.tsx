/**
 * LoadingSpinner - centered animated spinner used on all loading states
 */
const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

export default LoadingSpinner;

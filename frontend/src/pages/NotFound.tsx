import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const NotFound = () => (
  <div className="container mx-auto flex flex-col items-center justify-center px-4 py-32 text-center">
    <h1 className="font-display text-8xl font-bold text-primary mb-4">404</h1>
    <h2 className="font-display text-2xl font-bold mb-2">Page Not Found</h2>
    <p className="text-muted-foreground mb-8">
      The page you're looking for doesn't exist or has been moved.
    </p>
    <Button asChild>
      <Link to="/">Go Home</Link>
    </Button>
  </div>
);

export default NotFound;

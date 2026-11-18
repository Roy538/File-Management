import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="doc-title text-2xl">There’s nothing at this address</h1>
      <p className="mt-2 text-[13.5px] text-muted">The link may be mistyped or the item may have moved.</p>
      <Link to="/" className="mt-5 inline-block text-sm font-medium text-navy-800 underline">Go to home</Link>
    </div>
  );
}

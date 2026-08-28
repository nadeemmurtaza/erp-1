'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function CountSheetPage({ params }: { params: { id: string } }) {
  const [barcode, setBarcode] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;

    try {
      const res = await fetch(`/api/admin/inventory/counts/${params.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: barcode.trim() }),
      });
      if (res.ok) {
        setMessage(`Scanned ${barcode}`);
        setBarcode('');
        router.refresh(); // Or optimistically update
      } else {
        setMessage(`Failed to scan: ${await res.text()}`);
      }
    } catch (err) {
      setMessage('Error scanning');
    }
  };

  const handleComplete = async () => {
    try {
      const res = await fetch(`/api/admin/inventory/counts/${params.id}/complete`, {
        method: 'POST',
      });
      if (res.ok) {
        router.push('/admin/inventory/counts');
      } else {
        setMessage(`Failed to complete: ${await res.text()}`);
      }
    } catch (err) {
      setMessage('Error completing');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Count Sheet</h1>
      
      {/* Scanner Input (A USB scanner acts as a keyboard and presses Enter) */}
      <div className="p-4 bg-white shadow rounded-lg">
        <form onSubmit={handleScan} className="flex gap-4">
          <input 
            autoFocus
            type="text"
            value={barcode}
            onChange={e => setBarcode(e.target.value)}
            placeholder="Scan barcode..."
            className="border p-2 rounded w-full"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Submit</button>
        </form>
        {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}
      </div>

      <div>
        <button onClick={handleComplete} className="bg-green-600 text-white px-4 py-2 rounded">
          Complete Count
        </button>
      </div>
    </div>
  );
}

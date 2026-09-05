import React, { useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle, QrCode, Share2 } from 'lucide-react';
import { formQRFilename, qrCanvasBlob, renderBrandedFormQR } from '@/lib/brandedFormQR';

const action = 'inline-flex min-h-11 items-center justify-center gap-2 border border-xert-steel/25 px-4 text-sm font-semibold text-xert-pale transition-colors hover:border-xert-steel hover:text-white disabled:cursor-not-allowed disabled:opacity-50';

export default function FormQRCode({
  form,
  publicURL,
  onNotice,
  title = 'Branded QR code',
  description = 'For posters, the front desk or social posts. The QR always opens this form’s public link.',
}) {
  const canvasRef = useRef(null);
  const qrFileRef = useRef(null);
  const generationRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [canShareFile, setCanShareFile] = useState(false);

  useEffect(() => {
    const generation = ++generationRef.current;
    let current = true;
    qrFileRef.current = null;
    setReady(false); setCanShareFile(false); setError('');
    const offscreenCanvas = document.createElement('canvas');
    renderBrandedFormQR(offscreenCanvas, publicURL)
      .then(async renderedCanvas => {
        const file = new File([await qrCanvasBlob(renderedCanvas)], formQRFilename(form), { type: 'image/png' });
        if (!current || generation !== generationRef.current) return;
        const visibleCanvas = canvasRef.current;
        const context = visibleCanvas?.getContext('2d');
        if (!visibleCanvas || !context) throw new Error('This browser could not display the QR image.');
        visibleCanvas.width = renderedCanvas.width;
        visibleCanvas.height = renderedCanvas.height;
        context.drawImage(renderedCanvas, 0, 0);
        qrFileRef.current = file;
        setReady(true);
        if (navigator.share && navigator.canShare) {
          try { setCanShareFile(navigator.canShare({ files: [file] })); } catch { setCanShareFile(false); }
        }
      })
      .catch(err => { if (current && generation === generationRef.current) setError(err.message); });
    return () => { current = false; };
  }, [form, publicURL]);

  const download = async () => {
    const file = qrFileRef.current;
    if (!ready || !file) return;
    setBusy(true); setError('');
    try {
      const objectURL = URL.createObjectURL(file);
      const link = document.createElement('a'); link.href = objectURL; link.download = file.name; link.hidden = true;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectURL), 30_000);
      onNotice('Branded QR code downloaded.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const file = qrFileRef.current;
    if (!ready || !canShareFile || !file) return;
    setBusy(true); setError('');
    try {
      await navigator.share({ files: [file], title: `${form.title} — XERT Fitness`, text: 'Scan to open this XERT form.' });
    } catch (err) {
      if (err.name !== 'AbortError') setError('The QR code could not be shared. Download it instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border border-xert-steel/20 bg-xert-ink p-5">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center bg-xert-steel/10 text-xert-steel"><QrCode className="h-5 w-5" /></span><div><h2 className="font-display text-2xl uppercase text-white">{title}</h2><p className="mt-1 text-sm text-xert-pale/50">{description}</p></div></div>
      <div className="mx-auto mt-5 max-w-72 bg-white p-3">
        <div className="relative aspect-square w-full">
          <canvas ref={canvasRef} aria-label={`QR code for ${form.title || title}`} className={`h-full w-full transition-opacity ${ready ? 'opacity-100' : 'opacity-0'}`} />
          {!ready && !error && <div role="status" className="absolute inset-0 grid place-items-center text-sm text-slate-600"><span><LoaderCircle className="mr-2 inline h-5 w-5 animate-spin" />Creating QR…</span></div>}
        </div>
      </div>
      {error && <p role="alert" className="mt-3 border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">{error}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" className={action} disabled={!ready || busy} onClick={download}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PNG</button>{canShareFile && <button type="button" className={action} disabled={!ready || busy} onClick={share}><Share2 className="h-4 w-4" /> Share QR image</button>}</div>
      <p className="mt-3 break-all text-xs text-xert-pale/40">{publicURL}</p>
    </section>
  );
}

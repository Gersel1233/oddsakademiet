/* ============================================================
   Spiis – forbindelse til den fælles database (Supabase).
   Anon-nøglen er lavet til at ligge offentligt på hjemmesider;
   adgangsreglerne (RLS) i databasen styrer, hvad den må.
   Fjernes/tømmes url, kører sitet videre lokalt i browseren.
   ============================================================ */

window.SPIIS_CLOUD = {
  url: 'https://jhdlxexgrwvuoqetcgbt.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZGx4ZXhncnd2dW9xZXRjZ2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5ODI2NDYsImV4cCI6MjA5ODU1ODY0Nn0.EfsaL3HSMIinQcs4fJq7_282Q8jFm7wXkRQh614Sb-s',
};

/* Push-notifikationer til admin-appen. Nøglen her er den OFFENTLIGE
   halvdel af nøgleparret – den er lavet til at ligge åbent. Den
   hemmelige halvdel ligger kun i Supabase (Edge Function secrets). */
window.SPIIS_PUSH = {
  publicKey: 'BCaHDVv0nPADUsAbbNENNmCvA5Wrnnm4VZoAGJT4GlxK41yTmXd5_XDVccbq_UH3BMAjNklvZ9_0hEgjToul0Io',
};

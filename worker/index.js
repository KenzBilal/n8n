import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Worker started. Listening for jobs...');

// Listen to the 'jobs' table for new jobs
supabase
  .channel('custom-all-channel')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'jobs' },
    (payload) => {
      console.log('New job received!', payload.new);
      handleJob(payload.new);
    }
  )
  .subscribe();

async function handleJob(job) {
  if (job.status !== 'PENDING') return;

  // Mark job as RUNNING
  await supabase
    .from('jobs')
    .update({ status: 'RUNNING' })
    .eq('id', job.id);

  console.log(`Processing job ${job.id} of type ${job.type}`);
  
  // TODO: Add Puppeteer scraping logic here
  // TODO: Add Gemini AI processing here

  // Mark job as COMPLETED
  await supabase
    .from('jobs')
    .update({ status: 'COMPLETED' })
    .eq('id', job.id);

  console.log(`Job ${job.id} completed.`);
}

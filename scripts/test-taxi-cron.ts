/**
 * Manual Test Script for Taxi Cron
 * 
 * This script can be run locally to test the taxi cron endpoint
 * and verify that it properly validates taxi squads and records snapshots.
 * 
 * Usage:
 *   npx tsx scripts/test-taxi-cron.ts
 * 
 * Requirements:
 *   - CRON_SECRET environment variable must be set
 *   - Database must be accessible
 *   - Sleeper API must be accessible
 */

async function testTaxiCron() {
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.error('❌ CRON_SECRET environment variable not set');
    console.error('   Set it in your .env.local file');
    process.exit(1);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const endpoint = `${baseUrl}/api/taxi/cron`;

  console.log('🧪 Testing Taxi Cron Endpoint');
  console.log('━'.repeat(60));
  console.log(`Endpoint: ${endpoint}`);
  console.log('');

  try {
    console.log('📡 Sending request to cron endpoint...');
    const startTime = Date.now();
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-cron-secret': cronSecret,
        'Content-Type': 'application/json',
      },
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    console.log('');
    console.log('📊 Response Status:', response.status);
    console.log('⏱️  Duration:', `${duration}ms`);
    console.log('');

    if (response.ok) {
      console.log('✅ Cron executed successfully');
      console.log('');
      console.log('Response Data:');
      console.log(JSON.stringify(data, null, 2));
      
      if (data.skipped) {
        console.log('');
        console.log('ℹ️  Note: Cron was skipped (not in run window)');
        console.log('   Run windows:');
        console.log('   - Wed 5:00 PM ET (warning)');
        console.log('   - Thu 3:00 PM ET (warning)');
        console.log('   - Sun 11:00 AM ET (warning)');
        console.log('   - Sun 8:00 PM ET (official)');
      } else if (data.ok) {
        console.log('');
        console.log('📈 Summary:');
        console.log(`   Run Type: ${data.runType}`);
        console.log(`   Season: ${data.season}`);
        console.log(`   Week: ${data.week}`);
        console.log(`   Teams Processed: ${data.processed}`);
        console.log(`   Teams with Violations: ${data.teamsWithViolations || 0}`);
        console.log(`   League ID: ${data.leagueId}`);
        console.log(`   Used Fallback: ${data.usedFallback ? 'Yes' : 'No'}`);
      }
    } else {
      console.log('❌ Cron execution failed');
      console.log('');
      console.log('Error Data:');
      console.log(JSON.stringify(data, null, 2));
    }

    console.log('');
    console.log('━'.repeat(60));
    
  } catch (error) {
    console.error('');
    console.error('❌ Request failed with error:');
    console.error(error);
    console.error('');
    console.error('Possible issues:');
    console.error('  - Server not running (start with: npm run dev)');
    console.error('  - Database not accessible');
    console.error('  - Network connectivity issues');
    process.exit(1);
  }
}

// Run the test
testTaxiCron().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkZoomColumn() {
  try {
    const { data, error } = await supabase
      .from('pd_verifications')
      .select('zoom_link')
      .limit(1);

    if (error) {
      if (error.message.includes('column "zoom_link" does not exist')) {
        console.log("MIGRATION_REQUIRED: Column 'zoom_link' is missing.");
      } else {
        console.error("Error:", error.message);
      }
    } else {
      console.log("SUCCESS: Column 'zoom_link' exists.");
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

checkZoomColumn();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  try {
    console.log("Checking columns for 'pd_verifications'...");
    const { data, error } = await supabase
      .from('pd_verifications')
      .select('*')
      .limit(1);

    if (error) {
      console.error("Error fetching data:", error.message);
    } else {
      console.log("Existing columns:", Object.keys(data[0] || {}));
    }
  } catch (err) {
    console.error("Unexpected error:", err.message);
  }
}

checkSchema();

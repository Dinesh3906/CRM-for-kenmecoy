const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm-system')
  .then(async () => {
    const Pipeline = require('../models/Pipeline');
    
    console.log('=== CHECKING PIPELINE ===');
    const pipeline = await Pipeline.findOne({ name: 'default' });
    
    if (pipeline) {
      console.log('Pipeline found:', pipeline.name);
      console.log('Columns:', JSON.stringify(pipeline.columns, null, 2));
    } else {
      console.log('No default pipeline found in database');
    }
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

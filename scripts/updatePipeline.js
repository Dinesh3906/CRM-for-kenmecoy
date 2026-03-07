const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_sales', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', async () => {
    console.log('Connected to MongoDB');
    
    try {
        const Pipeline = require('../models/Pipeline');
        
        // Find and update the default pipeline
        const result = await Pipeline.updateOne(
            { isDefault: true },
            {
                $set: {
                    name: 'Sales Pipeline',
                    columns: [
                        { id: 'new', name: 'New', icon: 'fas fa-star', color: '#667eea', order: 1 },
                        { id: 'work-in-progress', name: 'Work-in-Progress', icon: 'fas fa-spinner', color: '#f39c12', order: 2 },
                        { id: 'won', name: 'Won', icon: 'fas fa-trophy', color: '#2ecc71', order: 3 },
                        { id: 'lost', name: 'Lost', icon: 'fas fa-times-circle', color: '#e74c3c', order: 4 }
                    ]
                }
            }
        );
        
        console.log('Pipeline update result:', result);
        
        if (result.matchedCount === 0) {
            console.log('No default pipeline found, creating new one...');
            const newPipeline = new Pipeline({
                name: 'Sales Pipeline',
                isDefault: true,
                columns: [
                    { id: 'new', name: 'New', icon: 'fas fa-star', color: '#667eea', order: 1 },
                    { id: 'work-in-progress', name: 'Work-in-Progress', icon: 'fas fa-spinner', color: '#f39c12', order: 2 },
                    { id: 'won', name: 'Won', icon: 'fas fa-trophy', color: '#2ecc71', order: 3 },
                    { id: 'lost', name: 'Lost', icon: 'fas fa-times-circle', color: '#e74c3c', order: 4 }
                ]
            });
            await newPipeline.save();
            console.log('New pipeline created successfully!');
        } else {
            console.log('Pipeline updated successfully!');
        }
        
        // Display current pipeline
        const currentPipeline = await Pipeline.findOne({ isDefault: true });
        console.log('\nCurrent default pipeline:');
        console.log(JSON.stringify(currentPipeline, null, 2));
        
        process.exit(0);
    } catch (error) {
        console.error('Error updating pipeline:', error);
        process.exit(1);
    }
});

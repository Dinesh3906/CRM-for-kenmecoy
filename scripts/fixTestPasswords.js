require('dotenv').config();
const mongoose = require('mongoose');

async function fixPasswords() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        const testEmails = [
            'superadmin@test.com',
            'salesadmin@test.com',
            'opsadmin@test.com',
            'salesmanager@test.com',
            'opsmanager@test.com',
            'salesstaff1@test.com',
            'salesstaff2@test.com',
            'opsstaff1@test.com',
            'opsstaff2@test.com'
        ];

        console.log('Updating passwords to plain text "test123"...\n');

        for (const email of testEmails) {
            const result = await mongoose.connection.db.collection('users').updateOne(
                { email: email },
                { $set: { password: 'test123' } }
            );
            
            if (result.matchedCount > 0) {
                console.log(`✓ Updated: ${email}`);
            } else {
                console.log(`✗ Not found: ${email}`);
            }
        }

        console.log('\n✓ All passwords updated to: test123\n');

        await mongoose.connection.close();
        console.log('MongoDB connection closed');
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixPasswords();

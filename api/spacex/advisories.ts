import { MongoClient } from 'mongodb';

export default async function handler(req, res) {
    // Setup CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Prevent caching 
    res.setHeader('Cache-Control', 'no-store');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Discard any request that is not GET
    if (req.method !== 'GET') {
        res.status(405).json({ message: 'Method Not Allowed' });
        return;
    }

    // Connect to MongoDB
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        res.status(500).json({ message: 'MONGODB_URI is not defined' });
        return;
    }
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db('danielmillar');
        const collection = database.collection('faa_advisories');

        // Fetch advisories
        const documents = await collection.find().toArray();
        res.status(200).json({ advisories: documents });
    } catch (error) {
        res.status(500).json({ message: error.message });
    } finally {
        await client.close();
    }
}
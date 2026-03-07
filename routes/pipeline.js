const express = require('express');
const router = express.Router();
const Pipeline = require('../models/Pipeline');

// Get all pipelines
router.get('/', async (req, res) => {
    try {
        const pipelines = await Pipeline.find().sort({ createdAt: -1 });
        res.json(pipelines);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get default pipeline
router.get('/default', async (req, res) => {
    try {
        let pipeline = await Pipeline.findOne({ isDefault: true });
        
        // If no default pipeline exists, create one with default columns
        if (!pipeline) {
            pipeline = new Pipeline({
                name: 'Sales Pipeline',
                isDefault: true,
                columns: [
                    { id: 'new', name: 'New', icon: 'fas fa-star', color: '#667eea', order: 1 },
                    { id: 'work-in-progress', name: 'Work-in-Progress', icon: 'fas fa-spinner', color: '#f39c12', order: 2 },
                    { id: 'won', name: 'Won', icon: 'fas fa-trophy', color: '#2ecc71', order: 3 },
                    { id: 'lost', name: 'Lost', icon: 'fas fa-times-circle', color: '#e74c3c', order: 4 }
                ]
            });
            await pipeline.save();
        }
        
        res.json(pipeline);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create a new pipeline
router.post('/', async (req, res) => {
    try {
        console.log('Creating new pipeline with data:', req.body);
        
        const pipeline = new Pipeline(req.body);
        const newPipeline = await pipeline.save();
        
        console.log('Pipeline created successfully:', newPipeline);
        res.status(201).json(newPipeline);
    } catch (error) {
        console.error('Error creating pipeline:', error);
        res.status(400).json({ message: error.message });
    }
});

// Update a pipeline
router.patch('/:id', async (req, res) => {
    try {
        console.log('Updating pipeline with ID:', req.params.id);
        console.log('Update data:', req.body);
        
        const pipeline = await Pipeline.findById(req.params.id);
        if (!pipeline) {
            return res.status(404).json({ message: 'Pipeline not found' });
        }
        
        // Update only the fields that are provided
        if (req.body.name) pipeline.name = req.body.name;
        if (req.body.columns) pipeline.columns = req.body.columns;
        if (req.body.isDefault !== undefined) pipeline.isDefault = req.body.isDefault;
        
        const updatedPipeline = await pipeline.save();
        console.log('Pipeline updated successfully:', updatedPipeline);
        res.json(updatedPipeline);
    } catch (error) {
        console.error('Error updating pipeline:', error);
        res.status(400).json({ message: error.message });
    }
});

// Delete a pipeline
router.delete('/:id', async (req, res) => {
    try {
        const pipeline = await Pipeline.findById(req.params.id);
        if (!pipeline) {
            return res.status(404).json({ message: 'Pipeline not found' });
        }
        
        if (pipeline.isDefault) {
            return res.status(400).json({ message: 'Cannot delete default pipeline' });
        }
        
        await Pipeline.deleteOne({ _id: req.params.id });
        res.json({ message: 'Pipeline deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Set default pipeline
router.patch('/:id/set-default', async (req, res) => {
    try {
        // Remove default from all pipelines
        await Pipeline.updateMany({}, { isDefault: false });
        
        // Set the specified pipeline as default
        const pipeline = await Pipeline.findById(req.params.id);
        if (!pipeline) {
            return res.status(404).json({ message: 'Pipeline not found' });
        }
        
        pipeline.isDefault = true;
        const updatedPipeline = await pipeline.save();
        res.json(updatedPipeline);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router; 
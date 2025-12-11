import { Router } from 'express';
import { getCommunityInfo, postCommunityEvent } from '../services/community';

const router = Router();

// Route to get community information
router.get('/info', getCommunityInfo);

// Route to post a new community event
router.post('/event', postCommunityEvent);

export default router;
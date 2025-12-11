import { Router } from 'express';
import { registerUser, loginUser, getUserProfile } from '../services/auth';

const router = Router();

// Route for user registration
router.post('/register', registerUser);

// Route for user login
router.post('/login', loginUser);

// Route for getting user profile
router.get('/profile', getUserProfile);

export default router;
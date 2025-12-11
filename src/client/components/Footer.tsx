import React from 'react';

const Footer: React.FC = () => {
    return (
        <footer>
            <div className="footer-content">
                <p>&copy; {new Date().getFullYear()} Pokémon Go Community. All rights reserved.</p>
                <p>Follow us on social media!</p>
                <ul className="social-media">
                    <li><a href="https://twitter.com/pokemongocommunity" target="_blank" rel="noopener noreferrer">Twitter</a></li>
                    <li><a href="https://facebook.com/pokemongocommunity" target="_blank" rel="noopener noreferrer">Facebook</a></li>
                    <li><a href="https://instagram.com/pokemongocommunity" target="_blank" rel="noopener noreferrer">Instagram</a></li>
                </ul>
            </div>
        </footer>
    );
};

export default Footer;
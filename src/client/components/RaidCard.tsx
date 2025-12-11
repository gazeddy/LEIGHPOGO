import React from 'react';

interface RaidCardProps {
    raidName: string;
    raidLevel: number;
    raidBoss: string;
    startTime: string;
    endTime: string;
}

const RaidCard: React.FC<RaidCardProps> = ({ raidName, raidLevel, raidBoss, startTime, endTime }) => {
    return (
        <div className="raid-card">
            <h2>{raidName}</h2>
            <p>Level: {raidLevel}</p>
            <p>Boss: {raidBoss}</p>
            <p>Start Time: {new Date(startTime).toLocaleString()}</p>
            <p>End Time: {new Date(endTime).toLocaleString()}</p>
        </div>
    );
};

export default RaidCard;
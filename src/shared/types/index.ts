export type User = {
    id: string;
    username: string;
    email: string;
    password: string;
    createdAt: Date;
    updatedAt: Date;
};

export type Raid = {
    id: string;
    location: string;
    pokemon: string;
    startTime: Date;
    endTime: Date;
    level: number;
};

export type Notification = {
    id: string;
    userId: string;
    message: string;
    createdAt: Date;
    read: boolean;
};
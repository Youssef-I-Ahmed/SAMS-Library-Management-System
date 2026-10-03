import { Router } from 'express';
import { prisma } from '../config/prisma.js';
export const healthRouter=Router();
healthRouter.get('/',async(_req,res,next)=>{try{await prisma.$queryRaw`SELECT 1`;res.json({status:'ok',service:'sams-api',database:'connected',timestamp:new Date().toISOString()});}catch(e){next(e);}});

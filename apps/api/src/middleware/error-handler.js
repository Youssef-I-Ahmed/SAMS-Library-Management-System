export function notFound(req,res){res.status(404).json({error:{code:'NOT_FOUND',message:`Route not found: ${req.method} ${req.originalUrl}`}});}
export function errorHandler(err,_req,res,_next){console.error(err);res.status(500).json({error:{code:'INTERNAL_SERVER_ERROR',message:'Unexpected server error'}});}

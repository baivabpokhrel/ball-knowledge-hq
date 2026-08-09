import demo from '../data/demo.json' with { type: 'json' };
export default function handler(req,res){res.status(200).json(demo)}

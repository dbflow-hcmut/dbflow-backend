// Force @types/multer global augmentation (Express.Multer.File) to be active.
// @types/multer v2.x is a module file so its `declare global` block only takes
// effect when the package is imported somewhere in the compilation.
import 'multer';

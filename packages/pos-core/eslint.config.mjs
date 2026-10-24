import base from '@newax/config/eslint';

export default [...base, { ignores: ['dist/**', 'coverage/**'] }];

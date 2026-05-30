export class ArraySpec {
  constructor(shape, dtype = 'float32', name = 'array') {
    this.shape = shape;
    this.dtype = dtype;
    this.name = name;
  }
}

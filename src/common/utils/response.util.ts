export function successful(code = 200, data: any = null, message = "success") {
  return { code, data, message };
}

export function failed(code = 400, data: any = null, message = "error") {
  return { code, data, message };
}
